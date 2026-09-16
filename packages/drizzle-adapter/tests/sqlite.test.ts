import { describe, expect, test } from "bun:test";
import { runAdapterContractTests } from "@vperms/adapter-contract";
import {
  sqliteSchema,
  VeguiPermsSqliteAdapter,
} from "@vperms/drizzle-adapter/sqlite";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SubjectType, VeguiPermsService } from "vperms";

runAdapterContractTests("VeguiPermsSqliteAdapter", () => {
  const client = new Database(":memory:");
  const db = drizzle(client, { schema: sqliteSchema });
  const adapter = new VeguiPermsSqliteAdapter({ db });

  return {
    adapter,
    migrate: () => adapter.migrate(),
    cleanup: async () => {
      client.close();
    },
  };
});

describe("VeguiPermsSqliteAdapter", () => {
  test("does not create the schema until migrate is called", async () => {
    const client = new Database(":memory:");
    const db = drizzle(client, { schema: sqliteSchema });
    const adapter = new VeguiPermsSqliteAdapter({ db });

    await expect(adapter.findSubject("workspace", "team")).rejects.toThrow();

    client.close();
  });

  test("migrate is idempotent", async () => {
    const client = new Database(":memory:");
    const db = drizzle(client, { schema: sqliteSchema });
    const adapter = new VeguiPermsSqliteAdapter({ db });

    await adapter.migrate();
    await adapter.migrate();

    expect(await adapter.findSubject("workspace", "team")).toBeNull();

    client.close();
  });

  test("works end-to-end with VeguiPermsService", async () => {
    const client = new Database(":memory:");
    const db = drizzle(client, { schema: sqliteSchema });
    const adapter = new VeguiPermsSqliteAdapter({ db });
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

    client.close();
  });
});
