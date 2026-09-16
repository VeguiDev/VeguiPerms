import {
  type PermissionGrant,
  type Subject,
  VeguiPermsAdapter,
} from "@vperms/core";
import type { SqlAdapterDriver } from "./driver";

/**
 * SQL {@link VeguiPermsAdapter} implementation, independent of the concrete
 * engine.
 *
 * It only maps between the public `Subject`/`PermissionGrant` shapes and the
 * flat rows handled by a {@link SqlAdapterDriver}. Dialect-specific packages
 * provide the driver.
 */
export class VeguiPermsSqlAdapter extends VeguiPermsAdapter {
  protected readonly driver: SqlAdapterDriver;

  constructor(driver: SqlAdapterDriver) {
    super();
    this.driver = driver;
  }

  /**
   * Creates the schema and applies pending migrations. Never called
   * automatically: applications must invoke it explicitly during setup.
   */
  migrate(): Promise<void> {
    return this.driver.migrate();
  }

  override async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<Subject | null> {
    const record = await this.driver.findSubject(workspaceId, subjectId);
    if (!record) {
      return null;
    }
    return {
      id: record.id,
      type: record.type,
      parents: [...record.parents],
    };
  }

  override async saveSubject(
    workspaceId: string,
    subject: Subject,
  ): Promise<Subject> {
    await this.driver.upsertSubject({
      workspaceId,
      id: subject.id,
      type: subject.type,
      parents: [...subject.parents],
    });
    return subject;
  }

  override deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    return this.driver.deleteSubject(workspaceId, subjectId);
  }

  override async findSubjectGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<PermissionGrant[]> {
    const records = await this.driver.findGrants(workspaceId, subjectId);
    return records.map((record) => ({
      workspaceId: record.workspaceId,
      subjectId: record.subjectId,
      permission: record.permission,
      value: record.value,
    }));
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
    await this.driver.upsertGrant(grant);
    return grant;
  }

  override ungrantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    return this.driver.deleteGrant(workspaceId, subjectId, permission);
  }
}
