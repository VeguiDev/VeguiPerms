import type { Request } from "express";
import type {
  Ability,
  DefaultParents,
  Principal,
  RequestContext,
  Subject,
  SubjectId,
  SubjectType,
  VeguiPermsAdapter,
} from "vperms";

export type SubjectResolverResult = SubjectId | Principal | null;

export type SubjectResolver = (
  req: Request,
) => SubjectResolverResult | Promise<SubjectResolverResult>;

export interface PermissionsExportOptions {
  /**
   * Route pattern the resolved-permission export is served from, for example
   * `/subject/:subjectId`. Must contain exactly one parameter segment.
   */
  path: string;
}

export interface VPermsModuleOptions {
  adapter: VeguiPermsAdapter;
  resolver: SubjectResolver;
  workspace: string;
  defaultParents?: DefaultParents;
  /**
   * Enables the resolved-permission export endpoint. Disabled when omitted.
   */
  permissionsExport?: PermissionsExportOptions;
}

/**
 * Internal per-request state. Its presence is what makes hydration idempotent,
 * so the resolver never runs twice for the same request.
 */
export const VPERMS_STATE: unique symbol = Symbol("vperms.requestState");

/**
 * The Nest request shape hydrated by {@link VPermsGuard}.
 */
export interface VpermsRequest extends Request {
  ability: Ability;
  subject?: Subject;
  kind?: SubjectType;
  [VPERMS_STATE]?: RequestContext;
}
