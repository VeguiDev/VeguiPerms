import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { runAdapterContractTests } from "@vperms/adapter-contract";
import { VeguiPermsMongoDBAdapter } from "@vperms/mongodb-adapter";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SubjectType, VeguiPermsService } from "vperms";

let server: MongoMemoryServer;
let client: MongoClient;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = new MongoClient(server.getUri());
  await client.connect();
});

afterAll(async () => {
  await client.close();
  await server.stop();
});

let databaseCounter = 0;

function freshDatabase() {
  return client.db(`vperms_contract_${databaseCounter++}`);
}

async function collectionNames(database: ReturnType<typeof freshDatabase>) {
  const infos = await database
    .listCollections({}, { nameOnly: true })
    .toArray();
  return infos.map((info) => info.name);
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

describe("VeguiPermsMongoDBAdapter", () => {
  test("does not create collections until migrate is called", async () => {
    const db = freshDatabase();
    const adapter = new VeguiPermsMongoDBAdapter({ db });

    expect(await collectionNames(db)).not.toContain("vperms_subjects");

    await adapter.migrate();

    expect(await collectionNames(db)).toContain("vperms_subjects");
    expect(await collectionNames(db)).toContain("vperms_grants");

    await db.dropDatabase();
  });

  test("migrate is idempotent", async () => {
    const db = freshDatabase();
    const adapter = new VeguiPermsMongoDBAdapter({ db });

    await adapter.migrate();
    await adapter.migrate();

    expect(await adapter.findSubject("workspace", "team")).toBeNull();

    await db.dropDatabase();
  });

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

    expect(await vperms.can(workspace, "user", "workspaces.1.read")).toBe(true);
    expect(await vperms.can(workspace, "user", "workspaces.2.read")).toBe(
      false,
    );

    await db.dropDatabase();
  });
});
