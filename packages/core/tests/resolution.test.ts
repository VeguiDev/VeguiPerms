import { describe, expect, test } from "bun:test";
import type { ResolvedPermissionGrant, Subject } from "@vperms/core";
import {
  matchPermission,
  resolveInheritedPermissions,
  SubjectType,
  VeguiPermsMemoryAdapter,
} from "@vperms/core";

const WS = "workspace";

function subject(id: string, parents: string[] = []): Subject {
  return { id, type: SubjectType.Group, parents };
}

async function resolve(
  adapter: VeguiPermsMemoryAdapter,
  subjectId: string,
): Promise<ResolvedPermissionGrant[]> {
  const root = await adapter.findSubject(WS, subjectId);
  if (!root) {
    throw new Error(`subject ${subjectId} not found`);
  }
  return resolveInheritedPermissions(adapter, WS, root);
}

function depthOf(
  grants: ResolvedPermissionGrant[],
  permission: string,
): number | undefined {
  return grants.find((grant) => grant.permission === permission)?.depth;
}

describe("resolveInheritedPermissions", () => {
  test("tags grants with their inheritance depth", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["admins"]));
    await adapter.saveSubject(WS, subject("admins", ["staff"]));
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.grantPermission(WS, "admins", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "staff", "workspaces.1.write", true);

    const resolved = await resolve(adapter, "user");

    expect(depthOf(resolved, "workspaces.1.read")).toBe(1);
    expect(depthOf(resolved, "workspaces.1.write")).toBe(2);
  });

  test("a closer parent overrides a more distant ancestor", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["near"]));
    await adapter.saveSubject(WS, subject("near", ["far"]));
    await adapter.saveSubject(WS, subject("far"));
    await adapter.grantPermission(WS, "near", "workspaces.1.read", false);
    await adapter.grantPermission(WS, "far", "workspaces.1.read", true);

    const resolved = await resolve(adapter, "user");

    expect(matchPermission(resolved, "workspaces.1.read")).toBe(false);
  });

  test("resolves permissions from multiple parents", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["left", "right"]));
    await adapter.saveSubject(WS, subject("left"));
    await adapter.saveSubject(WS, subject("right"));
    await adapter.grantPermission(WS, "right", "workspaces.1.read", true);

    const resolved = await resolve(adapter, "user");

    expect(matchPermission(resolved, "workspaces.1.read")).toBe(true);
  });

  test("terminates on cyclic inheritance", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["group"]));
    await adapter.saveSubject(WS, subject("group", ["user"]));
    await adapter.grantPermission(WS, "group", "workspaces.1.read", true);

    const resolved = await resolve(adapter, "user");

    expect(depthOf(resolved, "workspaces.1.read")).toBe(1);
    expect(matchPermission(resolved, "workspaces.1.read")).toBe(true);
  });

  test("is independent of the parents order", async () => {
    const forward = new VeguiPermsMemoryAdapter();
    const reversed = new VeguiPermsMemoryAdapter();

    await forward.saveSubject(WS, subject("user", ["alpha", "beta"]));
    await reversed.saveSubject(WS, subject("user", ["beta", "alpha"]));
    for (const adapter of [forward, reversed]) {
      await adapter.saveSubject(WS, subject("alpha"));
      await adapter.saveSubject(WS, subject("beta"));
      await adapter.grantPermission(WS, "alpha", "workspaces.1.read", true);
      await adapter.grantPermission(WS, "beta", "workspaces.1.read", false);
    }

    const a = await resolve(forward, "user");
    const b = await resolve(reversed, "user");

    expect(a).toEqual(b);
    expect(matchPermission(a, "workspaces.1.read")).toBe(false);
  });

  test("ignores parents that do not exist", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["ghost"]));

    const resolved = await resolve(adapter, "user");

    expect(resolved).toEqual([]);
  });
});
