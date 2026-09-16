import { fileURLToPath } from "node:url";
import type { SubjectType } from "@vperms/core";
import type {
  GrantRecord,
  SqlAdapterDriver,
  SubjectRecord,
} from "@vperms/sql-adapter";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { type sqliteSchema, vpermsGrants, vpermsSubjects } from "./schema";

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../migrations/sqlite", import.meta.url),
);

export interface SqliteDriverOptions {
  /**
   * Folder containing the bundled drizzle-kit migrations. Defaults to the
   * `migrations/sqlite` folder shipped with this package.
   */
  migrationsFolder?: string;
}

/**
 * SQLite implementation of {@link SqlAdapterDriver} backed by Drizzle ORM.
 *
 * Accepts an already-created Drizzle database instance; it never opens or
 * closes connections on its own.
 */
export class SqliteDriver implements SqlAdapterDriver {
  private readonly db: BetterSQLite3Database<typeof sqliteSchema>;
  private readonly migrationsFolder: string;

  constructor(
    db: BetterSQLite3Database<typeof sqliteSchema>,
    options: SqliteDriverOptions = {},
  ) {
    this.db = db;
    this.migrationsFolder =
      options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  }

  async migrate(): Promise<void> {
    migrate(this.db, { migrationsFolder: this.migrationsFolder });
  }

  async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<SubjectRecord | null> {
    const row = this.db
      .select()
      .from(vpermsSubjects)
      .where(
        and(
          eq(vpermsSubjects.workspaceId, workspaceId),
          eq(vpermsSubjects.id, subjectId),
        ),
      )
      .get();

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
    this.db
      .insert(vpermsSubjects)
      .values({
        workspaceId: record.workspaceId,
        id: record.id,
        type: record.type,
        parents: record.parents,
      })
      .onConflictDoUpdate({
        target: [vpermsSubjects.workspaceId, vpermsSubjects.id],
        set: { type: record.type, parents: record.parents },
      })
      .run();
  }

  async deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    const result = this.db
      .delete(vpermsSubjects)
      .where(
        and(
          eq(vpermsSubjects.workspaceId, workspaceId),
          eq(vpermsSubjects.id, subjectId),
        ),
      )
      .run();
    return result.changes > 0;
  }

  async findGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<GrantRecord[]> {
    const rows = this.db
      .select()
      .from(vpermsGrants)
      .where(
        and(
          eq(vpermsGrants.workspaceId, workspaceId),
          eq(vpermsGrants.subjectId, subjectId),
        ),
      )
      .all();

    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      subjectId: row.subjectId,
      permission: row.permission,
      value: row.value,
    }));
  }

  async upsertGrant(record: GrantRecord): Promise<void> {
    this.db
      .insert(vpermsGrants)
      .values({
        workspaceId: record.workspaceId,
        subjectId: record.subjectId,
        permission: record.permission,
        value: record.value,
      })
      .onConflictDoUpdate({
        target: [
          vpermsGrants.workspaceId,
          vpermsGrants.subjectId,
          vpermsGrants.permission,
        ],
        set: { value: record.value },
      })
      .run();
  }

  async deleteGrant(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    const result = this.db
      .delete(vpermsGrants)
      .where(
        and(
          eq(vpermsGrants.workspaceId, workspaceId),
          eq(vpermsGrants.subjectId, subjectId),
          eq(vpermsGrants.permission, permission),
        ),
      )
      .run();
    return result.changes > 0;
  }
}
