import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { runAdapterContractTests } from "@vperms/adapter-contract";
import { VeguiPermsMongoDBAdapter } from "@vperms/mongodb-adapter";
import { MongoClient } from "mongodb";
import { SubjectType, VeguiPermsService } from "vperms";

const RUN = process.env.RUN_INTEGRATION === "1";
const URL = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/vperms";

if (RUN) {
  let client: MongoClient;

  beforeAll(async () => {
    client = new MongoClient(URL);
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
  });

  let databaseCounter = 0;

  function freshDatabase() {
    return client.db(`vperms_it_${databaseCounter++}`);
  }

  runAdapterContractTests("VeguiPermsMongoDBAdapter", () => {
    const db = freshDatabase();
    const adapter = new VeguiPermsMongoDBAdapter({ db });
    return {
      adapter,
      migrate: () => adapter.migrate(),
      cleanup: async () => {
        await db.dropDatabase();
      },
    };
  });

  describe("VeguiPermsMongoDBAdapter integration", () => {
    test("works end-to-end with VeguiPermsService", async () => {
      const db = freshDatabase();
      const adapter = new VeguiPermsMongoDBAdapter({ db });
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

      await db.dropDatabase();
    });
  });
}
