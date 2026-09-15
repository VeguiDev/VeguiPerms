import type { PermissionGrant, ResolvedPermissionGrant } from "./permission";
import { compareGrants } from "./specificity";

/**
 * Returns `true` when `grantPattern` matches `permission`.
 *
 * Segments are dot-separated. A `*` segment matches any single segment, and a
 * trailing `*` additionally matches any number of remaining segments,
 * including none.
 */
export function matchesPattern(
  grantPattern: string,
  permission: string,
): boolean {
  const grantParts = grantPattern.split(".");
  const permissionParts = permission.split(".");
  const lastIndex = grantParts.length - 1;

  for (let i = 0; i < grantParts.length; i++) {
    const grantPart = grantParts[i];

    if (grantPart === "*" && i === lastIndex) {
      return true;
    }
    if (i >= permissionParts.length) {
      return false;
    }
    if (grantPart === "*") {
      continue;
    }
    if (grantPart !== permissionParts[i]) {
      return false;
    }
  }

  return grantParts.length === permissionParts.length;
}

/**
 * Evaluates the highest-priority matching grant.
 *
 * Returns `true` for an explicit allow, `false` for an explicit deny, and
 * `null` when no grant matches. An explicit deny is preserved and never
 * converted into "no match".
 */
export function matchPermission(
  grants: (PermissionGrant | ResolvedPermissionGrant)[],
  permission: string,
): boolean | null {
  const ordered = [...grants].sort(compareGrants);

  for (const grant of ordered) {
    if (matchesPattern(grant.permission, permission)) {
      return grant.value;
    }
  }

  return null;
}
