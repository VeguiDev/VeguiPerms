import type { Request, RequestHandler } from "express";
import type {
  DefaultParents,
  Principal,
  SubjectId,
  VeguiPermsAdapter,
} from "vperms";
import { SubjectType, VeguiPermsService } from "vperms";
import type { RequestAbility } from "./ability";

export type SubjectResolverResult = SubjectId | Principal | null;

export type SubjectResolver = (
  req: Request,
) => SubjectResolverResult | Promise<SubjectResolverResult>;

export type WorkspaceResolver = (req: Request) => string | Promise<string>;

export interface VpermsMiddlewareOptions {
  adapter: VeguiPermsAdapter;
  resolver: SubjectResolver;
  workspace: string | WorkspaceResolver;
  defaultParents?: DefaultParents;
}

export const ANONYMOUS_SUBJECT_ID = "anonymous";

function createAbility(
  service: VeguiPermsService,
  workspace: string,
  subject: SubjectId | Principal,
): RequestAbility {
  const cache = new Map<string, Promise<boolean>>();

  return {
    can(permission: string): Promise<boolean> {
      let result = cache.get(permission);
      if (result === undefined) {
        result = service.can(workspace, subject, permission);
        cache.set(permission, result);
      }
      return result;
    },
  };
}

async function ensureAnonymousSubject(
  adapter: VeguiPermsAdapter,
  service: VeguiPermsService,
  workspace: string,
): Promise<SubjectId> {
  const existing = await adapter.findSubject(workspace, ANONYMOUS_SUBJECT_ID);
  if (!existing) {
    await service.saveSubject(workspace, {
      id: ANONYMOUS_SUBJECT_ID,
      type: SubjectType.Anon,
      parents: [],
    });
  }
  return ANONYMOUS_SUBJECT_ID;
}

export function vpermsMiddleware(
  options: VpermsMiddlewareOptions,
): RequestHandler {
  const service = new VeguiPermsService({
    adapter: options.adapter,
    defaultParents: options.defaultParents,
  });

  return async (req, _res, next) => {
    try {
      const workspace =
        typeof options.workspace === "function"
          ? await options.workspace(req)
          : options.workspace;

      const resolved = await options.resolver(req);
      const subject =
        resolved === null || resolved === undefined
          ? await ensureAnonymousSubject(options.adapter, service, workspace)
          : resolved;

      req.ability = createAbility(service, workspace, subject);
      next();
    } catch (error) {
      next(error);
    }
  };
}
