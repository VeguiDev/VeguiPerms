import { afterAll, describe, expect, test } from "bun:test";
import { runAdapterContractTests } from "@vperms/adapter-contract";
import {
  mysqlSchema,
  VeguiPermsMysqlAdapter,
} from "@vperms/drizzle-adapter/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { SubjectType, VeguiPermsService } from "vperms";

const RUN = process.env.RUN_INTEGRATION === "1";
const URL =
  process.env.MYSQL_URL ?? "mysql://vperms:vperms@127.0.0.1:3306/vperms";

if (RUN) {
  const pool = mysql.createPool(URL);
  const db = drizzle(pool, { schema: mysqlSchema, mode: "default" });

  afterAll(async () => {
    await pool.end();
  });

  runAdapterContractTests("VeguiPermsMysqlAdapter", () => {
    const adapter = new VeguiPermsMysqlAdapter({ db });
    return {
      adapter,
      migrate: () => adapter.migrate(),
      cleanup: async () => {
        await pool.query("DELETE FROM vperms_grants");
        await pool.query("DELETE FROM vperms_subjects");
      },
    };
  });

  describe("VeguiPermsMysqlAdapter integration", () => {
    test("works end-to-end with VeguiPermsService", async () => {
      const adapter = new VeguiPermsMysqlAdapter({ db });
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
