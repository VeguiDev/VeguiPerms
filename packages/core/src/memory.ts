import { VeguiPermsAdapter } from "./adapter";
import type { PermissionGrant } from "./permission";
import type { Subject } from "./subject";

/**
 * In-memory reference adapter, useful for tests and examples.
 */
export class VeguiPermsMemoryAdapter extends VeguiPermsAdapter {
  private subjects = new Map<string, Map<string, Subject>>();
  private grants = new Map<string, Map<string, Map<string, PermissionGrant>>>();

  private workspaceSubjects(workspaceId: string): Map<string, Subject> {
    let subjects = this.subjects.get(workspaceId);
    if (!subjects) {
      subjects = new Map();
      this.subjects.set(workspaceId, subjects);
    }
    return subjects;
  }

  private subjectGrants(
    workspaceId: string,
    subjectId: string,
  ): Map<string, PermissionGrant> {
    let workspaceGrants = this.grants.get(workspaceId);
    if (!workspaceGrants) {
      workspaceGrants = new Map();
      this.grants.set(workspaceId, workspaceGrants);
    }

    let subjectGrants = workspaceGrants.get(subjectId);
    if (!subjectGrants) {
      subjectGrants = new Map();
      workspaceGrants.set(subjectId, subjectGrants);
    }
    return subjectGrants;
  }

  override async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<Subject | null> {
    return this.subjects.get(workspaceId)?.get(subjectId) ?? null;
  }

  override async saveSubject(
    workspaceId: string,
    subject: Subject,
  ): Promise<Subject> {
    this.workspaceSubjects(workspaceId).set(subject.id, subject);
    return subject;
  }

  override async deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    return this.subjects.get(workspaceId)?.delete(subjectId) ?? false;
  }

  override async findSubjectGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<PermissionGrant[]> {
    const grants = this.grants.get(workspaceId)?.get(subjectId);
    return grants ? [...grants.values()] : [];
  }

  override async grantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
    value: boolean,
  ): Promise<PermissionGrant> {
    const grant: PermissionGrant = {
      workspaceId,
      subjectId,
      permission,
      value,
    };
    this.subjectGrants(workspaceId, subjectId).set(permission, grant);
    return grant;
  }

  override async ungrantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    return (
      this.grants.get(workspaceId)?.get(subjectId)?.delete(permission) ?? false
    );
  }
}
