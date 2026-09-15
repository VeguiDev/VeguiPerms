import type { PermissionGrant } from "./permission";
import type { Subject } from "./subject";

/**
 * Persistence boundary for VeguiPerms.
 *
 * The adapter only stores and retrieves data: it performs no validation,
 * permission resolution, inheritance or evaluation. It may assume that every
 * value it receives has already been validated by {@link VeguiPermsService}.
 */
export abstract class VeguiPermsAdapter {
  abstract findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<Subject | null>;

  abstract saveSubject(workspaceId: string, subject: Subject): Promise<Subject>;

  abstract deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean>;

  abstract findSubjectGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<PermissionGrant[]>;

  /**
   * Stores a grant. Implementations must upsert: for a given
   * `(workspaceId, subjectId, permission)` at most one grant exists, and the
   * new `value` replaces any previous one.
   */
  abstract grantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
    value: boolean,
  ): Promise<PermissionGrant>;

  /**
   * Removes the grant for `(workspaceId, subjectId, permission)`, if any.
   */
  abstract ungrantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean>;
}
