import { describe, expect, test } from "bun:test";
import { SubjectType } from "@vperms/core";
import {
  type GrantRecord,
  type SqlAdapterDriver,
  type SubjectRecord,
  VeguiPermsSqlAdapter,
} from "@vperms/sql-adapter";

class FakeDriver implements SqlAdapterDriver {
  private subjects = new Map<string, SubjectRecord>();
  private grants = new Map<string, GrantRecord>();
  migrated = 0;

  private subjectKey(workspaceId: string, id: string): string {
    return `${workspaceId}\u0000${id}`;
  }

  private grantKey(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): string {
    return `${workspaceId}\u0000${subjectId}\u0000${permission}`;
  }

  async migrate(): Promise<void> {
    this.migrated += 1;
  }

  async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<SubjectRecord | null> {
    return this.subjects.get(this.subjectKey(workspaceId, subjectId)) ?? null;
  }

  async upsertSubject(record: SubjectRecord): Promise<void> {
    this.subjects.set(this.subjectKey(record.workspaceId, record.id), record);
  }

  async deleteSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<boolean> {
    return this.subjects.delete(this.subjectKey(workspaceId, subjectId));
  }

  async findGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<GrantRecord[]> {
    return [...this.grants.values()].filter(
      (grant) =>
        grant.workspaceId === workspaceId && grant.subjectId === subjectId,
    );
  }

  async upsertGrant(record: GrantRecord): Promise<void> {
    this.grants.set(
      this.grantKey(record.workspaceId, record.subjectId, record.permission),
      record,
    );
  }

  async deleteGrant(
    workspaceId: string,
    subjectId: string,
    permission: string,
  ): Promise<boolean> {
    return this.grants.delete(
      this.grantKey(workspaceId, subjectId, permission),
    );
  }
}

describe("VeguiPermsSqlAdapter", () => {
  const WS = "workspace";

  test("maps subject rows to Subject and back", async () => {
    const driver = new FakeDriver();
    const adapter = new VeguiPermsSqlAdapter(driver);

    await adapter.saveSubject(WS, {
      id: "team",
      type: SubjectType.Group,
      parents: ["parent-a", "parent-b"],
    });

    expect(await adapter.findSubject(WS, "team")).toEqual({
      id: "team",
      type: SubjectType.Group,
      parents: ["parent-a", "parent-b"],
    });
    expect(await adapter.findSubject("other", "team")).toBeNull();
  });

  test("returns defensive copies of parents", async () => {
    const driver = new FakeDriver();
    const adapter = new VeguiPermsSqlAdapter(driver);

    const subject = {
      id: "team",
      type: SubjectType.Group,
      parents: ["parent"],
    };
    await adapter.saveSubject(WS, subject);
    subject.parents.push("mutated");

    const found = await adapter.findSubject(WS, "team");
    expect(found?.parents).toEqual(["parent"]);

    found?.parents.push("mutated-again");
    expect((await adapter.findSubject(WS, "team"))?.parents).toEqual([
      "parent",
    ]);
  });

  test("upserts a single grant per permission", async () => {
    const driver = new FakeDriver();
    const adapter = new VeguiPermsSqlAdapter(driver);

    await adapter.grantPermission(WS, "team", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "team", "workspaces.1.read", false);

    const grants = await adapter.findSubjectGrants(WS, "team");
    expect(grants).toHaveLength(1);
    expect(grants[0]?.value).toBe(false);
  });

  test("delegates migrate to the driver", async () => {
    const driver = new FakeDriver();
    const adapter = new VeguiPermsSqlAdapter(driver);

    await adapter.migrate();

    expect(driver.migrated).toBe(1);
  });
});
