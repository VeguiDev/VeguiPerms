import { VeguiPermsSqlAdapter } from "@vperms/sql-adapter";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PostgresDriver, type PostgresDriverOptions } from "./driver";
import type { PostgresSchema } from "./schema";

export interface VeguiPermsPostgresAdapterOptions
  extends PostgresDriverOptions {
  /**
   * An already-created Drizzle database instance (for example
   * `drizzle(pool, { schema: postgresSchema })`).
   */
  db: NodePgDatabase<PostgresSchema>;
}

/**
 * Postgres adapter for VeguiPerms.
 *
 * ```ts
 * const adapter = new VeguiPermsPostgresAdapter({
 *   db: drizzle(pool, { schema: postgresSchema }),
 * });
 * await adapter.migrate();
 * ```
 */
export class VeguiPermsPostgresAdapter extends VeguiPermsSqlAdapter {
  constructor({ db, ...options }: VeguiPermsPostgresAdapterOptions) {
    super(new PostgresDriver(db, options));
  }
}

export type { PostgresDriverOptions } from "./driver";
export { PostgresDriver } from "./driver";
export type { PostgresSchema } from "./schema";
export { postgresSchema, vpermsGrants, vpermsSubjects } from "./schema";
