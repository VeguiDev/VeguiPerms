# VeguiPerms (vperms)

Open-source authorization library based on hierarchical permissions such as
`workspaces.create`, `workspaces.1.read`, or `workspaces.1.*`.

Written in TypeScript, published as runtime-neutral ESM, and usable from both
**Bun** and **Node.js**:

```ts
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const vperms = new VeguiPermsService({ adapter: new VeguiPermsMemoryAdapter() });

await vperms.saveSubject("workspace", {
  id: "user",
  type: SubjectType.User,
  parents: ["developers"],
});
await vperms.saveSubject("workspace", {
  id: "developers",
  type: SubjectType.Group,
  parents: [],
});
await vperms.setPermission("workspace", "developers", "workspaces.1.*", true);

await vperms.can("workspace", "user", "workspaces.1.read"); // true (inherited)
await vperms.can("workspace", "user", "workspaces.2.read"); // false
```

## Repository layout

```txt
packages/core              Pure TypeScript permission engine (@vperms/core)
packages/vperms            Public API and service (`vperms` package)
packages/express           Express middleware integration (@vperms/express)
packages/nest              NestJS integration (@vperms/nest)
packages/sql-adapter       Dialect-agnostic SQL base adapter (@vperms/sql-adapter)
packages/drizzle-adapter   SQLite/MySQL/Postgres adapters via Drizzle (@vperms/drizzle-adapter)
packages/mongodb-adapter   MongoDB adapter (@vperms/mongodb-adapter)
packages/adapter-contract  Private shared contract test suite
examples/basic             Minimal usage example
```

## Requirements

- [Bun](https://bun.sh) 1.x
- [Node.js](https://nodejs.org) 18+ (only used for the compatibility tests)

## Getting started

```bash
bun install     # install dependencies
bun run build   # build the core engine and the public package
bun run test    # Bun tests + Node.js compatibility tests
```

Other commands:

```bash
bun run lint             # Biome
bun run format           # Biome --write
bun run typecheck        # tsc (strict)
bun run clean            # remove build outputs
bun run example          # run examples/basic with Bun
bun run db:generate      # regenerate Drizzle migrations for all SQL dialects
docker compose up -d     # start MySQL, Postgres and MongoDB for integration tests
bun run test:integration # adapter tests against the real databases
```

## Permission semantics

Permissions are dot-separated segments. A granted permission implies a
requested one when every segment matches exactly, or a granted segment is `*`
(matches any single segment), or the granted permission ends with `*`
(matches any number of remaining segments, including none).

| Granted             | Requested             | Allowed |
| ------------------- | --------------------- | ------- |
| `workspaces.1.read` | `workspaces.1.read`   | yes     |
| `workspaces.1.*`    | `workspaces.1.read`   | yes     |
| `workspaces.*.read` | `workspaces.7.read`   | yes     |
| `workspaces.*`      | `workspaces.7.create` | yes     |
| `workspaces.1.*`    | `workspaces.2.read`   | no      |
| `workspaces.1`      | `workspaces.1.read`   | no      |

A grant can be an explicit `deny` (`value: false`). When several grants match,
the most specific one wins (for example `workspaces.*.read` is more specific
than `workspaces.1.*`), and an explicit `deny` wins ties.

## Authorization

`VeguiPermsService` is the application-facing API. It owns validation,
permission resolution, inheritance, cycle protection and evaluation, while a
`VeguiPermsAdapter` only persists data.

```ts
vperms.can(workspaceId, subjectId, permission);
vperms.saveSubject(workspaceId, subject);
vperms.deleteSubject(workspaceId, subjectId);
vperms.setPermission(workspaceId, subjectId, permission, value);
vperms.unsetPermission(workspaceId, subjectId, permission);
```

Subjects inherit permissions from the IDs listed in their `parents`. Direct
permissions are always evaluated first and short-circuit the result: parent
(inherited) permissions are only resolved when no direct grant matches. Cycles
are detected and never cause infinite recursion. Closer parents take priority
over more distant ancestors, and the result does not depend on the order of the
`parents` array.

Public inputs are validated with [Zod](https://zod.dev).

## Principals

Every method that identifies a subject (`can`, `setPermission`,
`unsetPermission`, `deleteSubject`) accepts either a raw subject id or a
`Principal`:

```ts
import type { Principal } from "vperms";

class UserPrincipal implements Principal {
  constructor(private readonly id: string) {}

  getSubjectId(): string {
    return this.id;
  }
}

await vperms.can("workspace", new UserPrincipal("user"), "posts.read");
```

The service normalizes the value with `getSubjectId()` before validating it, so
adapters only ever see subject ids.

## Virtual parents

A service can apply virtual parents to every subject it evaluates:

```ts
const vperms = new VeguiPermsService({
  adapter,
  defaultParents: {
    global: ["everyone"],
    byType: { user: ["users"], service: ["services"] },
  },
});
```

Effective parents are resolved in layers, highest priority first:

1. the explicit `parents` stored on the subject,
2. `defaultParents.byType` for that subject's type,
3. `defaultParents.global`.

The next layer is only consulted when the previous one produced no matching
permission. A parent reached through a default contributes its own explicit
parents (same layer) and its own defaults, keeping the worse of the two layers.

Any parent id can be opted out per subject with a `!` prefix:

```ts
await vperms.saveSubject("workspace", {
  id: "user",
  type: SubjectType.User,
  parents: ["!everyone"],
});
```

Negation only opts out of virtual parents. It never removes an explicit parent
with the same id, removes the id from both virtual sources at once, and — when
declared on the evaluated subject — is propagated through the whole walk so the
id is never reached through a virtual source. An explicit `parents` entry can
always reintroduce it. Default parents cannot themselves be negation directives.

## Resolved permissions

`resolvePermissions(workspaceId, subject)` resolves the whole effective
permission set — direct grants, explicit, nested, type and global default
parents, `!parent` negation, allows and denies — into a JSON-safe DTO:

```ts
const resolved = await vperms.resolvePermissions("workspace", "user");
// {
//   id: "user",
//   type: "user",
//   parents: ["developers"],
//   permissions: [{ permission: "workspaces.1.read", value: true, weight: 100 }],
// }
```

`weight` encodes the final precedence and is computed, never persisted. It folds
together `source` (direct > explicit parent > type default > global default),
`depth` (closer parent > more distant ancestor) and `specificity` (more specific
permission > broader wildcard). Higher weight wins, and the order is
deterministic regardless of parent order.

`canResolved(permissions, permission)` re-evaluates that same precedence using
only the DTO, so a client needs nothing more than a pattern matcher and the
weights. It is guaranteed to agree with the server-side `can()`.

Subjects may always read their own resolved permissions through the built-in
`vperms.subject.me.permissions` grant (included in the DTO and overridable by an
explicit deny). Reading another subject requires
`vperms.subject.<subjectId>.permissions`, and normal wildcards such as
`vperms.subject.*.permissions` apply.

## Framework integrations

Both integrations hydrate a request-scoped `ability` (plus `subject` and `kind`)
and can expose the resolved-permission DTO. The export route is disabled unless
`permissionsExport` is configured, and it always authorizes with the request's
existing ability before returning anything.

### Express

```ts
import { hasAnyPermission, hasPermission, vpermsMiddleware } from "@vperms/express";

app.use(
  vpermsMiddleware({
    adapter,
    workspace: "workspace",
    resolver: (req) => req.user?.id ?? null,
    permissionsExport: { path: "/subject/:subjectId" },
  }),
);

app.get("/posts", hasPermission("posts.read"), postsHandler);
app.get("/admin", hasAnyPermission("admin.*", "staff"), adminHandler);
```

`resolver` may return a subject id, a `Principal` or `null` (the anonymous
subject). `hasPermission` requires every permission and `hasAnyPermission` at
least one, both short-circuiting.

### NestJS

```ts
@Module({
  imports: [
    VPermsModule.forRoot({
      adapter,
      workspace: "workspace",
      resolver: (req) => req.user?.id ?? null,
      permissionsExport: { path: "/subject/:subjectId" },
    }),
  ],
})
export class AppModule {}
```

`forRoot` registers a global guard that hydrates `req.ability`, `req.subject` and
`req.kind` once per request but never denies a route on its own. `@Permission()`
requires every listed permission, `@AnyPermission()` at least one, and both
evaluate only inside the guard:

```ts
@Get("me")
@Permission("account.active", (req) => `workspaces.${req.params.id}.read`)
getMe(
  @Subject() subject: Subject,
  @Kind() kind: SubjectType,
  @Ability() ability: Ability,
) {}
```

`@Ability()`, `@Subject()` and `@Kind()` only read already-hydrated state.
Extend `AbilityGuard` for custom guards that reuse the same ability without
resolving the principal again.

## Adapters

An adapter only persists subjects and grants. Every adapter receives an
**already-created client or Drizzle instance** (dependency injection) and
applies its schema through an **explicit `migrate()`** call — nothing touches
the database implicitly.

### SQLite, MySQL and Postgres

`@vperms/drizzle-adapter` exposes one entry point per dialect. The dialect comes
from the import you use:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  sqliteSchema,
  VeguiPermsSqliteAdapter,
} from "@vperms/drizzle-adapter/sqlite";

const adapter = new VeguiPermsSqliteAdapter({
  db: drizzle(new Database(":memory:"), { schema: sqliteSchema }),
});
await adapter.migrate();

const vperms = new VeguiPermsService({ adapter });
```

The MySQL and Postgres entry points are identical in shape:

```ts
import { drizzle } from "drizzle-orm/mysql2";
import {
  mysqlSchema,
  VeguiPermsMysqlAdapter,
} from "@vperms/drizzle-adapter/mysql";

const adapter = new VeguiPermsMysqlAdapter({
  db: drizzle(pool, { schema: mysqlSchema, mode: "default" }),
});
await adapter.migrate();
```

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import {
  postgresSchema,
  VeguiPermsPostgresAdapter,
} from "@vperms/drizzle-adapter/postgres";

const adapter = new VeguiPermsPostgresAdapter({
  db: drizzle(pool, { schema: postgresSchema }),
});
await adapter.migrate();
```

Each dialect ships its own migrations and resolves them automatically; pass
`migrationsFolder` to override the location. All dialects share
`@vperms/sql-adapter`, which maps rows to the public types.

### MongoDB

```ts
import { MongoClient } from "mongodb";
import { VeguiPermsMongoDBAdapter } from "@vperms/mongodb-adapter";

const adapter = new VeguiPermsMongoDBAdapter({
  db: new MongoClient(url).db("vperms"),
});
await adapter.migrate();
```

`migrate()` creates the `vperms_subjects` and `vperms_grants` collections and
their unique indexes idempotently.

### Testing adapters

`@vperms/adapter-contract` (private) holds the shared contract suite that every
adapter runs against, so behavior stays identical across backends:

```bash
bun run test             # unit tests, incl. SQLite and in-memory MongoDB
docker compose up -d     # MySQL, Postgres, MongoDB
bun run test:integration # same contract against the real databases
```

Integration tests are skipped unless `RUN_INTEGRATION=1` is set (which the
`test:integration` script does).

## Roadmap

Caching and advanced policy conditions are planned. The current milestone is
the in-memory reference adapter, the service pipeline, and the first database
adapters.

## License

MIT
