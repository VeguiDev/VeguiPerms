import type { VeguiPermsAdapter } from "./adapter";
import { matchesPattern } from "./engine";
import type { ResolvedPermissionGrant } from "./permission";
import {
  EXPLICIT_PARENT_LAYER,
  type ResolveInheritedPermissionsOptions,
  resolveInheritedPermissions,
} from "./resolution";
import { compareGrants } from "./specificity";
import type { Subject, SubjectId, SubjectType } from "./subject";

/**
 * A single effective permission of a subject, together with the priority it
 * resolved to.
 *
 * `weight` is derived from the resolved ordering (direct grants first, then
 * the inheritance layers, then a synthesized built-in grant) and is never
 * persisted. A higher weight means a higher precedence, so an evaluation can
 * pick the matching grant with the highest weight without understanding how
 * the permission was resolved.
 */
export interface ResolvedPermission {
  permission: string;
  value: boolean;
  weight: number;
}

/**
 * A JSON-safe snapshot of everything a client needs to evaluate permissions
 * for a subject locally: the effective permissions and their weights.
 *
 * It intentionally does not expose inheritance details such as depth, parent
 * traversal, default parents or adapters.
 */
export interface ResolvedSubject {
  id: SubjectId;
  type: SubjectType;
  parents: SubjectId[];
  permissions: ResolvedPermission[];
}

/**
 * Built-in permission node every subject may exercise on itself. It is
 * resolved as the lowest-priority effective grant and can therefore be
 * overridden by an explicit deny.
 */
export const SELF_PERMISSIONS_PERMISSION = "vperms.subject.me.permissions";

/**
 * Built-in permission node required to read another subject's resolved
 * permissions. `vperms.subject.*.permissions` matches it normally.
 */
export function subjectPermissionsPermission(subjectId: SubjectId): string {
  return `vperms.subject.${subjectId}.permissions`;
}

/**
 * Parent layer reserved for built-in grants. It sits below every inherited
 * layer so a built-in grant is always the weakest match.
 */
export const BUILTIN_PERMISSION_LAYER = 3;

/**
 * Evaluates a permission against resolved permissions using the same matching
 * semantics as server-side evaluation.
 *
 * The matching grant with the highest weight wins; a resolved deny is
 * therefore preserved. Returns `false` when nothing matches.
 */
export function canResolved(
  permissions: ResolvedPermission[],
  permission: string,
): boolean {
  let best: ResolvedPermission | undefined;

  for (const candidate of permissions) {
    if (!matchesPattern(candidate.permission, permission)) {
      continue;
    }
    if (best === undefined || candidate.weight > best.weight) {
      best = candidate;
    }
  }

  return best?.value ?? false;
}

/**
 * Resolves every effective permission for `subject`: direct grants, explicit
 * parents, nested parents, type default parents, global default parents and
 * the built-in self grant, honouring virtual parent negation.
 *
 * Grants are ordered with the same precedence as `can()` and deduplicated by
 * permission (keeping the highest-priority occurrence), then assigned
 * descending weights. The result is deterministic and independent of the
 * order of `subject.parents`.
 */
export async function resolveSubjectPermissions(
  adapter: VeguiPermsAdapter,
  workspaceId: string,
  subject: Subject,
  options: ResolveInheritedPermissionsOptions = {},
): Promise<ResolvedPermission[]> {
  const directGrants = await adapter.findSubjectGrants(workspaceId, subject.id);
  const direct: ResolvedPermissionGrant[] = directGrants.map((grant) => ({
    ...grant,
    depth: 0,
    layer: EXPLICIT_PARENT_LAYER,
  }));

  const inherited = await resolveInheritedPermissions(
    adapter,
    workspaceId,
    subject,
    options,
  );

  const builtin: ResolvedPermissionGrant = {
    permission: SELF_PERMISSIONS_PERMISSION,
    value: true,
    subjectId: subject.id,
    workspaceId,
    depth: 0,
    layer: BUILTIN_PERMISSION_LAYER,
  };

  const ordered = [...direct, ...inherited, builtin].sort(compareGrants);

  const seen = new Set<string>();
  const effective: ResolvedPermissionGrant[] = [];
  for (const grant of ordered) {
    if (seen.has(grant.permission)) {
      continue;
    }
    seen.add(grant.permission);
    effective.push(grant);
  }

  const total = effective.length;
  return effective.map((grant, index) => ({
    permission: grant.permission,
    value: grant.value,
    weight: total - index,
  }));
}
