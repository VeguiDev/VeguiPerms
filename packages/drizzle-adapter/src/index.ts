/**
 * Drizzle ORM adapter for VeguiPerms.
 *
 * Use the dialect-specific entry points:
 *
 * ```ts
 * import { VeguiPermsSqliteAdapter } from "@vperms/drizzle-adapter/sqlite";
 * import { VeguiPermsMysqlAdapter } from "@vperms/drizzle-adapter/mysql";
 * import { VeguiPermsPostgresAdapter } from "@vperms/drizzle-adapter/postgres";
 * ```
 */

export type {
  GrantRecord,
  SqlAdapterDriver,
  SubjectRecord,
} from "@vperms/sql-adapter";
export { VeguiPermsSqlAdapter } from "@vperms/sql-adapter";
