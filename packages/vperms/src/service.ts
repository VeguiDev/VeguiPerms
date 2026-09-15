import {
  matchPermission,
  type PermissionGrant,
  resolveInheritedPermissions,
  type Subject,
  type VeguiPermsAdapter,
} from "@vperms/core";
import {
  PermissionGrantSchema,
  PermissionSchema,
  SubjectIdSchema,
  SubjectSchema,
  WorkspaceIdSchema,
} from "./schemas";

export interface VeguiPermsServiceOptions {
  adapter: VeguiPermsAdapter;
}

/**
 * Public, application-facing authorization API.
 *
 * The service owns validation, permission resolution, inheritance, cycle
 * protection and evaluation. The adapter only persists data.
 */
export class VeguiPermsService {
  private readonly adapter: VeguiPermsAdapter;

  constructor({ adapter }: VeguiPermsServiceOptions) {
    this.adapter = adapter;
  }

  /**
   * Whether `subjectId` may perform `permission` in `workspaceId`.
   *
   * Direct grants are evaluated first and short-circuit the result. Parent
   * (inherited) permissions are only resolved when no direct grant matches.
   */
  async can(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(subjectId);
    const perm = PermissionSchema.parse(permission);

    const subject = await this.adapter.findSubject(ws, id);
    if (!subject) {
      return false;
    }

    const directGrants = await this.adapter.findSubjectGrants(ws, id);
    const directResult = matchPermission(directGrants, perm);
    if (directResult !== null) {
      return directResult;
    }

    const inheritedGrants = await resolveInheritedPermissions(
      this.adapter,
      ws,
      subject,
    );
    const inheritedResult = matchPermission(inheritedGrants, perm);

    return inheritedResult ?? false;
  }

  async saveSubject(workspaceId: string, subject: Subject): Promise<Subject> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const validated = SubjectSchema.parse(subject);
    return this.adapter.saveSubject(ws, validated);
  }

  async deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(subjectId);
    return this.adapter.deleteSubject(ws, id);
  }

  async setPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
    value: boolean,
  ): Promise<PermissionGrant> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(subjectId);
    const perm = PermissionSchema.parse(permission);
    const grant = PermissionGrantSchema.parse({
      workspaceId: ws,
      subjectId: id,
      permission: perm,
      value,
    });

    return this.adapter.grantPermission(ws, id, grant.permission, grant.value);
  }

  async unsetPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(subjectId);
    const perm = PermissionSchema.parse(permission);
    return this.adapter.ungrantPermission(ws, id, perm);
  }
}
