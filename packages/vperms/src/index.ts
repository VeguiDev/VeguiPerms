import { matchPermission as matchPermissionCore } from "@vperms/core";

/**
 * Returns `true` when the granted permission implies the requested one.
 *
 * Permissions are dot-separated hierarchical segments. A `*` segment matches
 * any single segment, and a trailing `*` additionally matches any number of
 * remaining segments.
 *
 * @example
 * ```ts
 * matchPermission("workspaces.1.*", "workspaces.1.read"); // true
 * matchPermission("workspaces.1.*", "workspaces.2.read"); // false
 * ```
 */
export function matchPermission(granted: string, requested: string): boolean {
  return matchPermissionCore(granted, requested);
}
