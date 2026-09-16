import type {
  ResolvedSubject,
  SubjectId,
  VeguiPermsAdapter,
} from "@vperms/core";
import {
  SELF_PERMISSIONS_PERMISSION,
  subjectPermissionsPermission,
} from "@vperms/core";
import {
  InvalidSubjectIdError,
  PermissionDeniedError,
  SubjectNotFoundError,
} from "./errors";
import type { Ability } from "./runtime";
import { SubjectIdSchema } from "./schemas";
import type { VeguiPermsService } from "./service";

export interface PermissionsExportMatch {
  subjectId: string;
}

/**
 * A parsed `permissionsExport.path`.
 *
 * `base` and `routePattern` are framework-friendly (a Nest controller path and
 * its route), while `match` is used by Express to test an incoming pathname.
 * Exactly one `:param` segment is required.
 */
export interface PermissionsExportPath {
  path: string;
  base: string;
  routePattern: string;
  param: string;
  match(pathname: string): PermissionsExportMatch | null;
}

/**
 * Parses a permission-export route pattern such as `/subject/:subjectId`.
 *
 * The parameter segment identifies the target subject; the route is treated as
 * a literal match with exactly one dynamic segment.
 */
export function parsePermissionsExportPath(
  path: string,
): PermissionsExportPath {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0);

  const paramIndexes: number[] = [];
  segments.forEach((segment, index) => {
    if (segment.startsWith(":")) {
      paramIndexes.push(index);
    }
  });

  if (paramIndexes.length !== 1) {
    throw new Error(
      "@vperms: permissionsExport.path must contain exactly one ':subjectId' parameter segment",
    );
  }

  const paramIndex = paramIndexes[0];
  const paramSegment =
    paramIndex === undefined ? undefined : segments[paramIndex];
  if (paramIndex === undefined || paramSegment === undefined) {
    throw new Error("@vperms: permissionsExport.path is invalid");
  }

  const param = paramSegment.slice(1);
  if (param.length === 0) {
    throw new Error(
      "@vperms: permissionsExport.path has an unnamed parameter segment",
    );
  }

  const literals = segments.map((segment, index) =>
    index === paramIndex ? null : segment,
  );
  const base = segments.slice(0, paramIndex).join("/");
  const routePattern = segments.slice(paramIndex).join("/");

  return {
    path: normalized,
    base,
    routePattern,
    param,
    match(pathname: string): PermissionsExportMatch | null {
      const parts = pathname.split("/").filter((segment) => segment.length > 0);
      if (parts.length !== segments.length) {
        return null;
      }
      for (let i = 0; i < segments.length; i++) {
        const literal = literals[i];
        if (literal === null || literal === undefined) {
          continue;
        }
        if (parts[i] !== literal) {
          return null;
        }
      }
      const raw = parts[paramIndex];
      if (raw === undefined || raw.length === 0) {
        return null;
      }
      return { subjectId: decodeURIComponent(raw) };
    },
  };
}

/**
 * The permission a subject must hold to read resolved permissions for
 * `targetSubjectId`, treating the literal `"me"` as the current subject.
 */
function requiredExportPermission(
  isSelf: boolean,
  targetSubjectId: SubjectId,
): string {
  return isSelf
    ? SELF_PERMISSIONS_PERMISSION
    : subjectPermissionsPermission(targetSubjectId);
}

export interface ExportResolvedSubjectInput {
  service: VeguiPermsService;
  adapter: VeguiPermsAdapter;
  workspaceId: string;
  currentSubjectId: SubjectId;
  targetSubjectId: string;
  ability: Ability;
}

/**
 * Framework-independent permission-export behavior shared by the Express and
 * Nest integrations.
 *
 * Authorization always happens before the subject is loaded (or its
 * permissions exposed). Throws {@link PermissionDeniedError},
 * {@link SubjectNotFoundError} or {@link InvalidSubjectIdError} so each
 * integration can map them to its own HTTP response.
 */
export async function exportResolvedSubject({
  service,
  adapter,
  workspaceId,
  currentSubjectId,
  targetSubjectId,
  ability,
}: ExportResolvedSubjectInput): Promise<ResolvedSubject> {
  let target: SubjectId;

  if (targetSubjectId === "me") {
    target = currentSubjectId;
  } else {
    const parsed = SubjectIdSchema.safeParse(targetSubjectId);
    if (!parsed.success) {
      throw new InvalidSubjectIdError(targetSubjectId);
    }
    target = parsed.data;
  }

  const isSelf = target === currentSubjectId;
  const required = requiredExportPermission(isSelf, target);

  if (!(await ability.can(required))) {
    throw new PermissionDeniedError(required);
  }

  const record = await adapter.findSubject(workspaceId, target);
  if (!record) {
    throw new SubjectNotFoundError(target);
  }

  return service.resolvePermissions(workspaceId, target);
}
