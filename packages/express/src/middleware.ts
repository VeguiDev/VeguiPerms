import type { Request, RequestHandler, Response } from "express";
import type {
  DefaultParents,
  Principal,
  RequestContext,
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

export { ANONYMOUS_SUBJECT_ID } from "vperms";

export type SubjectResolverResult = SubjectId | Principal | null;

export type SubjectResolver = (
  req: Request,
) => SubjectResolverResult | Promise<SubjectResolverResult>;

export type WorkspaceResolver = (req: Request) => string | Promise<string>;

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

const REQUEST_STATE: unique symbol = Symbol("vperms.requestState");

interface VpermsRequest extends Request {
  [REQUEST_STATE]?: RequestContext;
}

interface HandlePermissionsExportInput {
  adapter: VeguiPermsAdapter;
  service: VeguiPermsService;
  workspaceId: string;
  context: RequestContext;
  targetSubjectId: string;
  res: Response;
}

async function handlePermissionsExport({
  adapter,
  service,
  workspaceId,
  context,
  targetSubjectId,
  res,
}: HandlePermissionsExportInput): Promise<void> {
  try {
    const dto = await exportResolvedSubject({
      service,
      adapter,
      workspaceId,
      currentSubjectId: context.id,
      targetSubjectId,
      ability: context.ability,
    });
    res.status(200).json(dto);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      res.sendStatus(403);
      return;
    }
    if (error instanceof SubjectNotFoundError) {
      res.sendStatus(404);
      return;
    }
    if (error instanceof InvalidSubjectIdError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}

export function vpermsMiddleware(
  options: VpermsMiddlewareOptions,
): RequestHandler {
  const service = new VeguiPermsService({
    adapter: options.adapter,
    defaultParents: options.defaultParents,
  });
  const exportPath: PermissionsExportPath | undefined =
    options.permissionsExport === undefined
      ? undefined
      : parsePermissionsExportPath(options.permissionsExport.path);

  return async (req, res, next) => {
    try {
      const workspace =
        typeof options.workspace === "function"
          ? await options.workspace(req)
          : options.workspace;

      const resolved = await options.resolver(req);
      const context = await resolveRequestContext({
        adapter: options.adapter,
        service,
        workspaceId: workspace,
        subject: resolved,
      });

      req.ability = context.ability;
      req.subject = context.subject;
      req.kind = context.kind;
      (req as VpermsRequest)[REQUEST_STATE] = context;

      if (exportPath && req.method === "GET") {
        const match = exportPath.match(req.path);
        if (match) {
          await handlePermissionsExport({
            adapter: options.adapter,
            service,
            workspaceId: workspace,
            context,
            targetSubjectId: match.subjectId,
            res,
          });
          return;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
