import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type {
  DefaultParents,
  Principal,
  SubjectId,
  VeguiPermsAdapter,
} from "vperms";
import {
  exportResolvedSubject,
  InvalidSubjectIdError,
  PermissionDeniedError,
  type PermissionsExportPath,
  parsePermissionsExportPath,
  resolveRequestContext,
  SubjectNotFoundError,
  VeguiPermsService,
} from "vperms";
import type { RequestAbility, VPermsEnv } from "./ability";

export { ANONYMOUS_SUBJECT_ID } from "vperms";

export type VPermsContext = Context<VPermsEnv>;

export type SubjectResolverResult = SubjectId | Principal | null;

export type SubjectResolver = (
  c: VPermsContext,
) => SubjectResolverResult | Promise<SubjectResolverResult>;

export type WorkspaceResolver = (c: VPermsContext) => string | Promise<string>;

export interface PermissionsExportOptions {
  /**
   * Route pattern the resolved-permission export is served from, for example
   * `/subject/:subjectId`. Must contain exactly one parameter segment.
   */
  path: string;
}

export interface VpermsMiddlewareOptions {
  adapter: VeguiPermsAdapter;
  resolver: SubjectResolver;
  workspace: string | WorkspaceResolver;
  defaultParents?: DefaultParents;
  /**
   * Enables the resolved-permission export route. Disabled when omitted.
   */
  permissionsExport?: PermissionsExportOptions;
}

interface HandlePermissionsExportInput {
  c: VPermsContext;
  adapter: VeguiPermsAdapter;
  service: VeguiPermsService;
  workspaceId: string;
  currentSubjectId: string;
  targetSubjectId: string;
  ability: RequestAbility;
}

async function handlePermissionsExport({
  c,
  adapter,
  service,
  workspaceId,
  currentSubjectId,
  targetSubjectId,
  ability,
}: HandlePermissionsExportInput): Promise<Response> {
  try {
    const dto = await exportResolvedSubject({
      service,
      adapter,
      workspaceId,
      currentSubjectId,
      targetSubjectId,
      ability,
    });
    return c.json(dto, 200);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return c.body(null, 403);
    }
    if (error instanceof SubjectNotFoundError) {
      return c.body(null, 404);
    }
    if (error instanceof InvalidSubjectIdError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
}

export function vpermsMiddleware(
  options: VpermsMiddlewareOptions,
): MiddlewareHandler<VPermsEnv> {
  const service = new VeguiPermsService({
    adapter: options.adapter,
    defaultParents: options.defaultParents,
  });
  const exportPath: PermissionsExportPath | undefined =
    options.permissionsExport === undefined
      ? undefined
      : parsePermissionsExportPath(options.permissionsExport.path);

  return createMiddleware<VPermsEnv>(async (c, next) => {
    const workspace =
      typeof options.workspace === "function"
        ? await options.workspace(c)
        : options.workspace;

    const resolved = await options.resolver(c);
    const context = await resolveRequestContext({
      adapter: options.adapter,
      service,
      workspaceId: workspace,
      subject: resolved,
    });

    c.set("ability", context.ability);
    c.set("subject", context.subject);
    c.set("kind", context.kind);

    if (exportPath && c.req.method === "GET") {
      const match = exportPath.match(c.req.path);
      if (match) {
        return handlePermissionsExport({
          c,
          adapter: options.adapter,
          service,
          workspaceId: workspace,
          currentSubjectId: context.id,
          targetSubjectId: match.subjectId,
          ability: context.ability,
        });
      }
    }

    await next();
  });
}
