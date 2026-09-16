import { fileURLToPath } from "node:url";
import type { SubjectType } from "@vperms/core";
import type {
  GrantRecord,
  SqlAdapterDriver,
  SubjectRecord,
} from "@vperms/sql-adapter";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { type mysqlSchema, vpermsGrants, vpermsSubjects } from "./schema";

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../migrations/mysql", import.meta.url),
);

export interface MysqlDriverOptions {
  /**
   * Folder containing the bundled drizzle-kit migrations. Defaults to the
   * `migrations/mysql` folder shipped with this package.
   */
  migrationsFolder?: string;
}

/**
 * MySQL implementation of {@link SqlAdapterDriver} backed by Drizzle ORM.
 *
 * Accepts an already-created Drizzle database instance; it never opens or
 * closes connections on its own.
 */
export class MysqlDriver implements SqlAdapterDriver {
  private readonly db: MySql2Database<typeof mysqlSchema>;
  private readonly migrationsFolder: string;

  constructor(
    db: MySql2Database<typeof mysqlSchema>,
    options: MysqlDriverOptions = {},
  ) {
    this.db = db;
    this.migrationsFolder =
      options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  }

  async migrate(): Promise<void> {
    await migrate(this.db, { migrationsFolder: this.migrationsFolder });
  }

  async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<SubjectRecord | null> {
    const rows = await this.db
      .select()
      .from(vpermsSubjects)
      .where(
        and(
          eq(vpermsSubjects.workspaceId, workspaceId),
          eq(vpermsSubjects.id, subjectId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      workspaceId: row.workspaceId,
      id: row.id,
      type: row.type as SubjectType,
      parents: row.parents,
    };
  }

  async upsertSubject(record: SubjectRecord): Promise<void> {
    await this.db
      .insert(vpermsSubjects)
      .values({
        workspaceId: record.workspaceId,
        id: record.id,
        type: record.type,
        parents: record.parents,
      })
      .onDuplicateKeyUpdate({
        set: { type: record.type, parents: record.parents },
      });
  }

  async deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    const [result] = await this.db
      .delete(vpermsSubjects)
      .where(
        and(
          eq(vpermsSubjects.workspaceId, workspaceId),
          eq(vpermsSubjects.id, subjectId),
        ),
      );
    return (result.affectedRows ?? 0) > 0;
  }

  async findGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<GrantRecord[]> {
    const rows = await this.db
      .select()
      .from(vpermsGrants)
      .where(
        and(
          eq(vpermsGrants.workspaceId, workspaceId),
          eq(vpermsGrants.subjectId, subjectId),
        ),
      );

    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      subjectId: row.subjectId,
      permission: row.permission,
      value: row.value,
    }));
  }

  async upsertGrant(record: GrantRecord): Promise<void> {
    await this.db
      .insert(vpermsGrants)
      .values({
        workspaceId: record.workspaceId,
        subjectId: record.subjectId,
        permission: record.permission,
        value: record.value,
      })
      .onDuplicateKeyUpdate({ set: { value: record.value } });
  }

  async deleteGrant(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    const [result] = await this.db
      .delete(vpermsGrants)
      .where(
        and(
          eq(vpermsGrants.workspaceId, workspaceId),
          eq(vpermsGrants.subjectId, subjectId),
          eq(vpermsGrants.permission, permission),
        ),
      );
    return (result.affectedRows ?? 0) > 0;
  }
}
