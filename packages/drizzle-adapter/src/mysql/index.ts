import { VeguiPermsSqlAdapter } from "@vperms/sql-adapter";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { MysqlDriver, type MysqlDriverOptions } from "./driver";
import type { MysqlSchema } from "./schema";

export interface VeguiPermsMysqlAdapterOptions extends MysqlDriverOptions {
  /**
   * An already-created Drizzle database instance (for example
   * `drizzle(pool, { schema: mysqlSchema, mode: "default" })`).
   */
  db: MySql2Database<MysqlSchema>;
}

/**
 * MySQL adapter for VeguiPerms.
 *
 * ```ts
 * const adapter = new VeguiPermsMysqlAdapter({
 *   db: drizzle(pool, { schema: mysqlSchema, mode: "default" }),
 * });
 * await adapter.migrate();
 * ```
 */
export class VeguiPermsMysqlAdapter extends VeguiPermsSqlAdapter {
  constructor({ db, ...options }: VeguiPermsMysqlAdapterOptions) {
    super(new MysqlDriver(db, options));
  }
}

export type { MysqlDriverOptions } from "./driver";
export { MysqlDriver } from "./driver";
export type { MysqlSchema } from "./schema";
export { mysqlSchema, vpermsGrants, vpermsSubjects } from "./schema";
