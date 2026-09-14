# VeguiPerms (vperms)

Open-source authorization library based on hierarchical permissions such as
`workspaces.create`, `workspaces.1.read`, or `workspaces.1.*`.

Written in TypeScript, published as runtime-neutral ESM, and usable from both
**Bun** and **Node.js**:

```ts
import { matchPermission } from "vperms";

matchPermission("workspaces.1.*", "workspaces.1.read"); // true
matchPermission("workspaces.1.*", "workspaces.2.read"); // false
```

## Repository layout

```txt
packages/core      Pure TypeScript permission engine (@vperms/core)
packages/vperms    Public API (`vperms` package)
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

| Granted             | Requested                  | Allowed |
| ------------------- | -------------------------- | ------- |
| `workspaces.1.read` | `workspaces.1.read`        | yes     |
| `workspaces.1.*`    | `workspaces.1.read`        | yes     |
| `workspaces.*.read` | `workspaces.7.read`        | yes     |
| `workspaces.*`      | `workspaces.7.create`      | yes     |
| `workspaces.1.*`    | `workspaces.2.read`        | no      |
| `workspaces.1`      | `workspaces.1.read`        | no      |

## Roadmap

Users, groups, group inheritance, workspaces, permission inheritance, storage
adapters, and database integrations are planned. The current milestone is only
the project foundation and the `matchPermission` pipeline end to end.

## License

MIT
