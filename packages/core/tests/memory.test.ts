import { describe, expect, test } from "bun:test";
import type { Subject } from "@vperms/core";
import { SubjectType, VeguiPermsMemoryAdapter } from "@vperms/core";

const WS = "workspace";
const OTHER = "other";

function subject(id: string): Subject {
  return { id, type: SubjectType.Group, parents: [] };
}

describe("VeguiPermsMemoryAdapter", () => {
  test("namespaces subjects by workspace", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("team"));

    expect(await adapter.findSubject(WS, "team")).not.toBeNull();
    expect(await adapter.findSubject(OTHER, "team")).toBeNull();
  });

  test("upserts a single grant per permission", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.grantPermission(WS, "team", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "team", "workspaces.1.read", false);

    const grants = await adapter.findSubjectGrants(WS, "team");

    expect(grants).toHaveLength(1);
    expect(grants[0]?.value).toBe(false);
  });

  test("ungrantPermission removes the grant", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.grantPermission(WS, "team", "workspaces.1.read", true);

    expect(
      await adapter.ungrantPermission(WS, "team", "workspaces.1.read"),
    ).toBe(true);
    expect(await adapter.findSubjectGrants(WS, "team")).toEqual([]);
  });

  test("deleteSubject only removes from its workspace", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("team"));
    await adapter.saveSubject(OTHER, subject("team"));

    await adapter.deleteSubject(WS, "team");

    expect(await adapter.findSubject(WS, "team")).toBeNull();
    expect(await adapter.findSubject(OTHER, "team")).not.toBeNull();
  });
});
