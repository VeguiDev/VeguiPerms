/**
 * VeguiPerms core: hierarchical permission matching.
 *
 * This package is the pure TypeScript engine behind VeguiPerms. It performs no
 * I/O and has no dependencies, so it can run anywhere JavaScript runs.
 *
 * # Permission semantics
 *
 * Permissions are dot-separated sequences of segments, for example
 * `workspaces.1.read`. A granted permission implies a requested one when:
 *
 * - every segment matches exactly, or
 * - a granted segment is `*`, which matches any single segment, or
 * - the granted permission ends with `*`, which additionally matches any
 *   number of remaining segments (including none).
 *
 * Examples:
 *
 * ```text
 * workspaces.1.*   implies workspaces.1.read   -> true
 * workspaces.*     implies workspaces.7.create -> true
 * workspaces.*.read implies workspaces.7.read  -> true
 * workspaces.1.*   implies workspaces.2.read   -> false
 * ```
 */

/**
 * Returns `true` when the granted permission implies the requested one.
 *
 * Both values are dot-separated permission strings such as
 * `workspaces.1.*` (granted) and `workspaces.1.read` (requested).
 *
 * @example
 * ```ts
 * matchPermission("workspaces.1.*", "workspaces.1.read"); // true
 * matchPermission("workspaces.1.*", "workspaces.2.read"); // false
 * ```
 */
export function matchPermission(granted: string, requested: string): boolean {
  if (granted === requested) {
    return true;
  }

  const grantedSegments = granted.split(".");
  const requestedSegments = requested.split(".");

  let index = 0;
  for (;;) {
    const grantedSegment = grantedSegments[index];
    const requestedSegment = requestedSegments[index];

    if (grantedSegment === undefined && requestedSegment === undefined) {
      return true;
    }

    // Granted is exhausted: it only covers the rest if it ended with "*".
    if (grantedSegment === undefined) {
      return grantedSegments[grantedSegments.length - 1] === "*";
    }

    // Requested is exhausted while granted still has segments: a trailing "*"
    // matches zero remaining segments, anything else does not.
    if (requestedSegment === undefined) {
      return grantedSegment === "*" && index === grantedSegments.length - 1;
    }

    if (grantedSegment === "*" || grantedSegment === requestedSegment) {
      index += 1;
      continue;
    }

    return false;
  }
}
