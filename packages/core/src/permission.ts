export interface PermissionGrant {
  /**
   * The permission node or string that is being granted.
   */
  permission: string;

  /**
   * The value of the permission grant. If true, the permission is granted; if false, the permission is denied.
   */
  value: boolean;

  subjectId: string;

  workspaceId: string;
}

/**
 * A permission grant resolved through subject inheritance, tagged with the
 * distance at which it was found and the parent layer it came from.
 *
 * `depth = 1` is a direct parent, `depth = 2` a parent's parent, and so on.
 */
export interface ResolvedPermissionGrant extends PermissionGrant {
  depth: number;

  /**
   * The parent layer the grant was found in. Lower is higher priority:
   * `0` is an explicit parent, `1` a type default and `2` a global default.
   */
  layer: number;
}
