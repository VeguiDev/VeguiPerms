import type { SubjectType } from "@vperms/core";

/**
 * A subject row as stored by an SQL backend.
 *
 * `parents` is a plain array of subject IDs; the driver is responsible for
 * encoding it in whatever native representation the engine provides (JSON
 * text, `jsonb`, ...).
 */
export interface SubjectRecord {
  workspaceId: string;
  id: string;
  type: SubjectType;
  parents: string[];
}

/**
 * A permission grant row as stored by an SQL backend.
 */
export interface GrantRecord {
  workspaceId: string;
  subjectId: string;
  permission: string;
  value: boolean;
}

/**
 * Minimal persistence contract that a concrete SQL engine must fulfil.
 *
 * The driver deals only with flat rows and has no knowledge of validation,
 * inheritance or permission matching: {@link VeguiPermsSqlAdapter} implements
 * that logic on top of it. Implementations must be idempotent on writes:
 * `upsertSubject` replaces the subject and `upsertGrant` replaces any previous
 * value for the same `(workspaceId, subjectId, permission)`.
 */
export interface SqlAdapterDriver {
  /**
   * Creates the schema and applies pending migrations. Must be idempotent.
   */
  migrate(): Promise<void>;

  findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<SubjectRecord | null>;

  upsertSubject(record: SubjectRecord): Promise<void>;

  deleteSubject(workspaceId: string, subjectId: string): Promise<boolean>;

  findGrants(workspaceId: string, subjectId: string): Promise<GrantRecord[]>;

  upsertGrant(record: GrantRecord): Promise<void>;

  deleteGrant(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean>;
}
