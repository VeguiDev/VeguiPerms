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
 * distance at which it was found.
 *
 * `depth = 1` is a direct parent, `depth = 2` a parent's parent, and so on.
 */
export interface ResolvedPermissionGrant extends PermissionGrant {
  depth: number;
}
