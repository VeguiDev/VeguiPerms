import type {
  PermissionsExportOptions,
  SubjectResolver,
  VPermsEnv,
  VpermsMiddlewareOptions,
} from "@vperms/hono";
import { vpermsMiddleware } from "@vperms/hono";
import { Hono } from "hono";
import type { DefaultParents } from "vperms";
import {
  type Principal,
  type SubjectId,
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

export const WS = "workspace";

export interface Seed {
  adapter: VeguiPermsMemoryAdapter;
  service: VeguiPermsService;
}

export async function seed(): Promise<Seed> {
  const adapter = new VeguiPermsMemoryAdapter();
  const service = new VeguiPermsService({ adapter });

  await service.saveSubject(WS, {
    id: "alice",
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, "alice", "posts.read", true);
  await service.setPermission(WS, "alice", "posts.write", true);

  await service.saveSubject(WS, {
    id: "bob",
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, "bob", "account.active", true);

  await service.saveSubject(WS, {
    id: "auditor",
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(
    WS,
    "auditor",
    "vperms.subject.*.permissions",
    true,
  );

  return { adapter, service };
}

export class StubPrincipal implements Principal {
  constructor(private readonly id: SubjectId) {}

  getSubjectId(): SubjectId {
    return this.id;
  }
}

export interface AppOptions {
  permissionsExport?: PermissionsExportOptions;
  defaultParents?: DefaultParents;
}

export function appWith(
  adapter: VeguiPermsMemoryAdapter,
  resolver: SubjectResolver,
  options: AppOptions = {},
): Hono<VPermsEnv> {
  const app = new Hono<VPermsEnv>();
  const config: VpermsMiddlewareOptions = {
    adapter,
    workspace: WS,
    resolver,
    ...options,
  };
  app.use(vpermsMiddleware(config));
  return app;
}
