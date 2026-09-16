import { afterAll, describe, expect, test } from "bun:test";
import { runAdapterContractTests } from "@vperms/adapter-contract";
import {
  postgresSchema,
  VeguiPermsPostgresAdapter,
} from "@vperms/drizzle-adapter/postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { SubjectType, VeguiPermsService } from "vperms";

const RUN = process.env.RUN_INTEGRATION === "1";
const URL =
  process.env.POSTGRES_URL ?? "postgres://vperms:vperms@127.0.0.1:5432/vperms";

if (RUN) {
  const pool = new Pool({ connectionString: URL });
  const db = drizzle(pool, { schema: postgresSchema });

  afterAll(async () => {
    await pool.end();
  });

  runAdapterContractTests("VeguiPermsPostgresAdapter", () => {
    const adapter = new VeguiPermsPostgresAdapter({ db });
    return {
      adapter,
      migrate: () => adapter.migrate(),
      cleanup: async () => {
        await pool.query("DELETE FROM vperms_grants");
        await pool.query("DELETE FROM vperms_subjects");
      },
    };
  });

  describe("VeguiPermsPostgresAdapter integration", () => {
    test("works end-to-end with VeguiPermsService", async () => {
      const adapter = new VeguiPermsPostgresAdapter({ db });
      await adapter.migrate();

      const vperms = new VeguiPermsService({ adapter });
      const workspace = "workspace";

      await vperms.saveSubject(workspace, {
        id: "user",
        type: SubjectType.User,
        parents: ["team"],
      });
      await vperms.saveSubject(workspace, {
        id: "team",
        type: SubjectType.Group,
        parents: [],
      });
      await vperms.setPermission(workspace, "team", "workspaces.1.*", true);

      expect(await vperms.can(workspace, "user", "workspaces.1.read")).toBe(
        true,
      );
      expect(await vperms.can(workspace, "user", "workspaces.2.read")).toBe(
        false,
      );

      await pool.query("DELETE FROM vperms_grants");
      await pool.query("DELETE FROM vperms_subjects");
    });
  });
}
