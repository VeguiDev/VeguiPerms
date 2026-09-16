import {
  type PermissionGrant,
  type Subject,
  VeguiPermsAdapter,
} from "@vperms/core";
import type { Db } from "mongodb";
import {
  GRANTS_COLLECTION,
  type GrantDocument,
  SUBJECTS_COLLECTION,
  type SubjectDocument,
} from "./documents";

export interface VeguiPermsMongoDBAdapterOptions {
  /**
   * An already-connected MongoDB `Db` instance. The adapter never opens or
   * closes connections on its own.
   */
  db: Db;

  /**
   * Collection name for subjects. Defaults to `vperms_subjects`.
   */
  subjectsCollection?: string;

  /**
   * Collection name for grants. Defaults to `vperms_grants`.
   */
  grantsCollection?: string;
}

/**
 * MongoDB adapter for VeguiPerms.
 *
 * ```ts
 * const adapter = new VeguiPermsMongoDBAdapter({ db });
 * await adapter.migrate();
 * ```
 */
export class VeguiPermsMongoDBAdapter extends VeguiPermsAdapter {
  private readonly db: Db;
  private readonly subjectsCollection: string;
  private readonly grantsCollection: string;

  constructor({
    db,
    subjectsCollection = SUBJECTS_COLLECTION,
    grantsCollection = GRANTS_COLLECTION,
  }: VeguiPermsMongoDBAdapterOptions) {
    super();
    this.db = db;
    this.subjectsCollection = subjectsCollection;
    this.grantsCollection = grantsCollection;
  }

  private subjects() {
    return this.db.collection<SubjectDocument>(this.subjectsCollection);
  }

  private grants() {
    return this.db.collection<GrantDocument>(this.grantsCollection);
  }

  /**
   * Creates the collections and their unique indexes. Idempotent, and never
   * called automatically: applications must invoke it explicitly during setup.
   */
  async migrate(): Promise<void> {
    const existing = await this.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const names = new Set(existing.map((info) => info.name));

    if (!names.has(this.subjectsCollection)) {
      await this.db.createCollection(this.subjectsCollection);
    }
    if (!names.has(this.grantsCollection)) {
      await this.db.createCollection(this.grantsCollection);
    }

    await this.subjects().createIndex(
      { workspaceId: 1, id: 1 },
      { unique: true },
    );
    await this.grants().createIndex(
      { workspaceId: 1, subjectId: 1, permission: 1 },
      { unique: true },
    );
  }

  override async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<Subject | null> {
    const document = await this.subjects().findOne({
      workspaceId,
      id: subjectId,
    });
    if (!document) {
      return null;
    }
    return {
      id: document.id,
      type: document.type,
      parents: [...document.parents],
    };
  }

  override async saveSubject(
    workspaceId: string,
    subject: Subject,
  ): Promise<Subject> {
    await this.subjects().updateOne(
      { workspaceId, id: subject.id },
      {
        $set: {
          type: subject.type,
          parents: [...subject.parents],
        },
      },
      { upsert: true },
    );
    return subject;
  }

  override async deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    const result = await this.subjects().deleteOne({
      workspaceId,
      id: subjectId,
    });
    return result.deletedCount > 0;
  }

  override async findSubjectGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<PermissionGrant[]> {
    const documents = await this.grants()
      .find({ workspaceId, subjectId })
      .toArray();

    return documents.map((document) => ({
      workspaceId: document.workspaceId,
      subjectId: document.subjectId,
      permission: document.permission,
      value: document.value,
    }));
  }

  override async grantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
    value: boolean,
  ): Promise<PermissionGrant> {
    await this.grants().updateOne(
      { workspaceId, subjectId, permission },
      { $set: { value } },
      { upsert: true },
    );
    return { workspaceId, subjectId, permission, value };
  }

  override async ungrantPermission(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    const result = await this.grants().deleteOne({
      workspaceId,
      subjectId,
      permission,
    });
    return result.deletedCount > 0;
  }
}
