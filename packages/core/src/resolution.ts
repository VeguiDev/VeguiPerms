import type { VeguiPermsAdapter } from "./adapter";
import { effectiveParentLayers, splitParents } from "./parents";
import type { ResolvedPermissionGrant } from "./permission";
import { compareGrants } from "./specificity";
import type { DefaultParents, Subject, SubjectId } from "./subject";

/**
 * Parent layer constants, ordered by priority (lower is higher priority).
 *
 * `EXPLICIT` are parents stored on the subject, `TYPE_DEFAULT` parents come
 * from `defaultParents.byType` and `GLOBAL_DEFAULT` parents come from
 * `defaultParents.global`.
 */
export const EXPLICIT_PARENT_LAYER = 0;
export const TYPE_DEFAULT_PARENT_LAYER = 1;
export const GLOBAL_DEFAULT_PARENT_LAYER = 2;

export interface ResolveInheritedPermissionsOptions {
  /**
   * Virtual parents applied on top of each walked subject's explicit parents.
   */
  defaultParents?: DefaultParents;
}

interface PendingParent {
  id: SubjectId;
  depth: number;
  layer: number;
}

function hasHigherPriority(a: PendingParent, b: PendingParent): boolean {
  if (a.layer !== b.layer) {
    return a.layer < b.layer;
  }
  return a.depth < b.depth;
}

function takeHighestPriority(
  pending: PendingParent[],
): PendingParent | undefined {
  let bestIndex = -1;

  for (let i = 0; i < pending.length; i++) {
    const candidate = pending[i];
    const best = bestIndex === -1 ? undefined : pending[bestIndex];
    if (candidate === undefined) {
      continue;
    }
    if (best === undefined || hasHigherPriority(candidate, best)) {
      bestIndex = i;
    }
  }

  if (bestIndex === -1) {
    return undefined;
  }
  return pending.splice(bestIndex, 1)[0];
}

/**
 * Resolves the permissions inherited from a subject's ancestors.
 *
 * Parents are walked highest-priority-first: explicit parents, then type
 * defaults, then global defaults, and within a layer the closest subject is
 * visited first. A subject reached as a parent also contributes its own
 * virtual parents, tagged with the worse of the two layers so defaults can
 * never outrank an explicit edge. A visited set prevents infinite recursion
 * through cyclic inheritance and collapses duplicate parents.
 *
 * A negation declared on the root subject is propagated to the whole walk:
 * the negated id is never added through a virtual source, not even when an
 * intermediate parent would apply it as one of its own defaults. Explicit
 * parents are never affected, so a parent that lists the negated id explicitly
 * still inherits from it.
 *
 * The resulting grants carry their inheritance `depth` and `layer`, and are
 * returned already ordered by priority and specificity.
 */
export async function resolveInheritedPermissions(
  adapter: VeguiPermsAdapter,
  workspaceId: string,
  subject: Subject,
  options: ResolveInheritedPermissionsOptions = {},
): Promise<ResolvedPermissionGrant[]> {
  const { defaultParents } = options;
  const visited = new Set<string>([subject.id]);
  const resolved: ResolvedPermissionGrant[] = [];
  const excluded = splitParents(subject.parents).excluded;

  const seed = effectiveParentLayers(subject, defaultParents);
  const pending: PendingParent[] = [
    ...seed.explicit.map((id) => ({
      id,
      depth: 1,
      layer: EXPLICIT_PARENT_LAYER,
    })),
    ...seed.byType.map((id) => ({
      id,
      depth: 1,
      layer: TYPE_DEFAULT_PARENT_LAYER,
    })),
    ...seed.global.map((id) => ({
      id,
      depth: 1,
      layer: GLOBAL_DEFAULT_PARENT_LAYER,
    })),
  ];

  while (pending.length > 0) {
    const current = takeHighestPriority(pending);
    if (!current) {
      break;
    }

    const { id, depth, layer } = current;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    const parent = await adapter.findSubject(workspaceId, id);
    if (!parent) {
      continue;
    }

    const grants = await adapter.findSubjectGrants(workspaceId, id);
    for (const grant of grants) {
      resolved.push({ ...grant, depth, layer });
    }

    const layers = effectiveParentLayers(parent, defaultParents);
    const childDepth = depth + 1;
    for (const childId of layers.explicit) {
      pending.push({ id: childId, depth: childDepth, layer });
    }
    for (const childId of layers.byType) {
      if (excluded.has(childId)) {
        continue;
      }
      pending.push({
        id: childId,
        depth: childDepth,
        layer: Math.max(layer, TYPE_DEFAULT_PARENT_LAYER),
      });
    }
    for (const childId of layers.global) {
      if (excluded.has(childId)) {
        continue;
      }
      pending.push({
        id: childId,
        depth: childDepth,
        layer: Math.max(layer, GLOBAL_DEFAULT_PARENT_LAYER),
      });
    }
  }

  return resolved.sort(compareGrants);
}
