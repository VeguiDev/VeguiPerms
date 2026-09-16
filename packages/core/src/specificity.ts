import type { PermissionGrant, ResolvedPermissionGrant } from "./permission";

/**
 * Scores how specific a permission pattern is.
 *
 * Exact segments increase specificity, wildcards reduce it, and a trailing
 * wildcard (which can match any number of remaining segments) reduces it the
 * most. This makes `workspaces.*.read` more specific than `workspaces.1.*`.
 */
export function permissionSpecificity(pattern: string): number {
  const parts = pattern.split(".");
  const lastIndex = parts.length - 1;

  let score = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "*") {
      score += i === lastIndex ? 0 : 1;
    } else {
      score += 2;
    }
  }
  return score;
}

export function exactSegments(pattern: string): number {
  return pattern.split(".").filter((part) => part !== "*").length;
}

function isResolved(
  grant: PermissionGrant | ResolvedPermissionGrant,
): grant is ResolvedPermissionGrant {
  return "depth" in grant;
}

export function depthOf(
  grant: PermissionGrant | ResolvedPermissionGrant,
): number {
  return isResolved(grant) ? grant.depth : 0;
}

export function layerOf(
  grant: PermissionGrant | ResolvedPermissionGrant,
): number {
  return isResolved(grant) ? grant.layer : 0;
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Deterministic ordering for permission grants, highest priority first.
 *
 * Priority is: closer parent layer, then closer inheritance depth, then more
 * specific pattern, then more exact segments, then explicit deny, and finally
 * a stable tiebreak by pattern and subject id. Because every tiebreak is
 * content-based, the order is independent of insertion order (for example, the
 * order of `parents`).
 */
export function compareGrants(
  a: PermissionGrant | ResolvedPermissionGrant,
  b: PermissionGrant | ResolvedPermissionGrant,
): number {
  const layer = layerOf(a) - layerOf(b);
  if (layer !== 0) {
    return layer;
  }

  const depth = depthOf(a) - depthOf(b);
  if (depth !== 0) {
    return depth;
  }

  const specificity =
    permissionSpecificity(b.permission) - permissionSpecificity(a.permission);
  if (specificity !== 0) {
    return specificity;
  }

  const exact = exactSegments(b.permission) - exactSegments(a.permission);
  if (exact !== 0) {
    return exact;
  }

  if (a.value !== b.value) {
    return a.value ? 1 : -1;
  }

  const permission = compareStrings(a.permission, b.permission);
  if (permission !== 0) {
    return permission;
  }

  return compareStrings(a.subjectId, b.subjectId);
}
