import { VeguiPermsSqlAdapter } from "@vperms/sql-adapter";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { SqliteDriver, type SqliteDriverOptions } from "./driver";
import type { SqliteSchema } from "./schema";

export interface VeguiPermsSqliteAdapterOptions extends SqliteDriverOptions {
  /**
   * An already-created Drizzle database instance (for example
   * `drizzle(new Database(":memory:"), { schema: sqliteSchema })`).
   */
  db: BetterSQLite3Database<SqliteSchema>;
}

/**
 * SQLite adapter for VeguiPerms.
 *
 * ```ts
 * const adapter = new VeguiPermsSqliteAdapter({
 *   db: drizzle(client, { schema: sqliteSchema }),
 * });
 * await adapter.migrate();
 * ```
 */
export class VeguiPermsSqliteAdapter extends VeguiPermsSqlAdapter {
  constructor({ db, ...options }: VeguiPermsSqliteAdapterOptions) {
    super(new SqliteDriver(db, options));
  }
}

export type { SqliteDriverOptions } from "./driver";
export { SqliteDriver } from "./driver";
export type { SqliteSchema } from "./schema";
export { sqliteSchema, vpermsGrants, vpermsSubjects } from "./schema";
