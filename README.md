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
packages/core      Pure TypeScript permission engine (@vperms/core)
packages/vperms    Public API and service (`vperms` package)
examples/basic     Minimal usage example
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
bun run lint        # Biome
bun run format      # Biome --write
bun run typecheck   # tsc (strict)
bun run clean       # remove build outputs
bun run example     # run examples/basic with Bun
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

## Roadmap

Database adapters, caching, and advanced policy conditions are planned. The
current milestone is the in-memory reference adapter and the service pipeline.

## License

MIT
