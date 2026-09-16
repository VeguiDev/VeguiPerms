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

describe("resolveInheritedPermissions with default parents", () => {
  const DEFAULTS = {
    global: ["everyone"],
    byType: { [SubjectType.User]: ["users"] },
  };

  async function resolveWithDefaults(
    adapter: VeguiPermsMemoryAdapter,
    subjectId: string,
  ): Promise<ResolvedPermissionGrant[]> {
    const root = await adapter.findSubject(WS, subjectId);
    if (!root) {
      throw new Error(`subject ${subjectId} not found`);
    }
    return resolveInheritedPermissions(adapter, WS, root, {
      defaultParents: DEFAULTS,
    });
  }

  test("tags grants with their parent layer", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, {
      id: "user",
      type: SubjectType.User,
      parents: ["staff"],
    });
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.saveSubject(WS, subject("users"));
    await adapter.saveSubject(WS, subject("everyone"));
    await adapter.grantPermission(WS, "staff", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "users", "workspaces.1.write", true);
    await adapter.grantPermission(WS, "everyone", "workspaces.1.delete", true);

    const resolved = await resolveWithDefaults(adapter, "user");

    const layerOf = (permission: string) =>
      resolved.find((grant) => grant.permission === permission)?.layer;

    expect(layerOf("workspaces.1.read")).toBe(0);
    expect(layerOf("workspaces.1.write")).toBe(1);
    expect(layerOf("workspaces.1.delete")).toBe(2);
  });

  test("an explicit layer beats a more specific default layer", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, {
      id: "user",
      type: SubjectType.User,
      parents: ["staff"],
    });
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.saveSubject(WS, subject("users"));
    await adapter.grantPermission(WS, "staff", "workspaces.*", true);
    await adapter.grantPermission(WS, "users", "workspaces.1.read", false);

    const resolved = await resolveWithDefaults(adapter, "user");

    expect(matchPermission(resolved, "workspaces.1.read")).toBe(true);
  });

  test("a default grant applies when the explicit subtree has no match", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, {
      id: "user",
      type: SubjectType.User,
      parents: ["staff"],
    });
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.saveSubject(WS, subject("users"));
    await adapter.grantPermission(WS, "staff", "workspaces.2.read", true);
    await adapter.grantPermission(WS, "users", "workspaces.1.read", false);

    const resolved = await resolveWithDefaults(adapter, "user");

    expect(depthOf(resolved, "workspaces.1.read")).toBe(1);
    expect(matchPermission(resolved, "workspaces.1.read")).toBe(false);
  });

  test("negated defaults are never resolved", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, {
      id: "user",
      type: SubjectType.User,
      parents: ["!everyone", "!users"],
    });
    await adapter.saveSubject(WS, subject("everyone"));
    await adapter.saveSubject(WS, subject("users"));
    await adapter.grantPermission(WS, "everyone", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "users", "workspaces.1.write", true);

    const resolved = await resolveWithDefaults(adapter, "user");

    expect(resolved).toEqual([]);
  });

  test("keeps cycle protection across default layers", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, {
      id: "user",
      type: SubjectType.User,
      parents: ["staff"],
    });
    await adapter.saveSubject(WS, subject("staff", ["user"]));
    await adapter.saveSubject(WS, subject("users", ["everyone"]));
    await adapter.saveSubject(WS, subject("everyone", ["users"]));
    await adapter.grantPermission(WS, "everyone", "workspaces.1.read", true);

    const resolved = await resolveWithDefaults(adapter, "user");

    expect(matchPermission(resolved, "workspaces.1.read")).toBe(true);
  });
});
