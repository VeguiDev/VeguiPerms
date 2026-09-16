import {
  type DefaultParents,
  matchPermission,
  type PermissionGrant,
  type Principal,
  resolveInheritedPermissions,
  type Subject,
  type SubjectId,
  type VeguiPermsAdapter,
} from "@vperms/core";
import {
  DefaultParentsSchema,
  PermissionGrantSchema,
  PermissionSchema,
  SubjectIdSchema,
  SubjectSchema,
  WorkspaceIdSchema,
} from "./schemas";

export interface VeguiPermsServiceOptions {
  adapter: VeguiPermsAdapter;

  /**
   * Virtual parents applied to every evaluated subject, on top of its
   * explicit `parents`. Negating a virtual parent is done per subject with
   * the `!parentId` syntax in `Subject.parents`.
   */
  defaultParents?: DefaultParents;
}

function resolveSubjectId(subject: SubjectId | Principal): SubjectId {
  return typeof subject === "string" ? subject : subject.getSubjectId();
}

/**
 * Public, application-facing authorization API.
 *
 * The service owns validation, permission resolution, inheritance, cycle
 * protection and evaluation. The adapter only persists data.
 *
 * Methods that identify a subject accept either a raw `SubjectId` or a
 * `Principal`, and normalize the input internally.
 */
export class VeguiPermsService {
  private readonly adapter: VeguiPermsAdapter;
  private readonly defaultParents?: DefaultParents;

  constructor({ adapter, defaultParents }: VeguiPermsServiceOptions) {
    this.adapter = adapter;
    this.defaultParents = defaultParents
      ? DefaultParentsSchema.parse(defaultParents)
      : undefined;
  }

  /**
   * Whether the subject may perform `permission` in `workspaceId`.
   *
   * Direct grants are evaluated first and short-circuit the result. Otherwise
   * explicit parents are resolved, then type defaults, then global defaults:
   * the next layer is only consulted when the previous one has no match.
   */
  async can(
    workspaceId: string,
    subject: SubjectId | Principal,
    permission: string,
  ): Promise<boolean> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(resolveSubjectId(subject));
    const perm = PermissionSchema.parse(permission);

    const record = await this.adapter.findSubject(ws, id);
    if (!record) {
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
      record,
      { defaultParents: this.defaultParents },
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
    subject: SubjectId | Principal,
  ): Promise<boolean> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(resolveSubjectId(subject));
    return this.adapter.deleteSubject(ws, id);
  }

  async setPermission(
    workspaceId: string,
    subject: SubjectId | Principal,
    permission: string,
    value: boolean,
  ): Promise<PermissionGrant> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(resolveSubjectId(subject));
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
    subject: SubjectId | Principal,
    permission: string,
  ): Promise<boolean> {
    const ws = WorkspaceIdSchema.parse(workspaceId);
    const id = SubjectIdSchema.parse(resolveSubjectId(subject));
    const perm = PermissionSchema.parse(permission);
    return this.adapter.ungrantPermission(ws, id, perm);
  }
}
