import { describe, expect, test } from "bun:test";
import type { ResolvedPermission, Subject } from "@vperms/core";
import {
  canResolved,
  resolveSubjectPermissions,
  SELF_PERMISSIONS_PERMISSION,
  SubjectType,
  VeguiPermsMemoryAdapter,
} from "@vperms/core";

const WS = "workspace";

function subject(
  id: string,
  parents: string[] = [],
  type = SubjectType.Group,
): Subject {
  return { id, type, parents };
}

async function resolve(
  adapter: VeguiPermsMemoryAdapter,
  subjectId: string,
  options: Parameters<typeof resolveSubjectPermissions>[3] = {},
): Promise<ResolvedPermission[]> {
  const root = await adapter.findSubject(WS, subjectId);
  if (!root) {
    throw new Error(`subject ${subjectId} not found`);
  }
  return resolveSubjectPermissions(adapter, WS, root, options);
}

function weightOf(
  permissions: ResolvedPermission[],
  permission: string,
): number | undefined {
  return permissions.find((entry) => entry.permission === permission)?.weight;
}

function valueAt(
  permissions: ResolvedPermission[],
  permission: string,
): boolean | undefined {
  return permissions.find((entry) => entry.permission === permission)?.value;
}

describe("resolveSubjectPermissions", () => {
  test("resolves direct grants", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.grantPermission(WS, "user", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user");

    expect(valueAt(permissions, "workspaces.1.read")).toBe(true);
    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
  });

  test("resolves explicit parents", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["staff"]));
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.grantPermission(WS, "staff", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
  });

  test("resolves nested parents", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["staff"]));
    await adapter.saveSubject(WS, subject("staff", ["org"]));
    await adapter.saveSubject(WS, subject("org"));
    await adapter.grantPermission(WS, "org", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
  });

  test("resolves type default parents", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", [], SubjectType.User));
    await adapter.saveSubject(WS, subject("users"));
    await adapter.grantPermission(WS, "users", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user", {
      defaultParents: { byType: { [SubjectType.User]: ["users"] } },
    });

    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
  });

  test("resolves global default parents", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.saveSubject(WS, subject("everyone"));
    await adapter.grantPermission(WS, "everyone", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user", {
      defaultParents: { global: ["everyone"] },
    });

    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
  });

  test("honours virtual parent negation", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["!everyone"]));
    await adapter.saveSubject(WS, subject("everyone"));
    await adapter.grantPermission(WS, "everyone", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user", {
      defaultParents: { global: ["everyone"] },
    });

    expect(valueAt(permissions, "workspaces.1.read")).toBeUndefined();
    expect(canResolved(permissions, "workspaces.1.read")).toBe(false);
  });

  test("keeps explicit allow and deny values", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.grantPermission(WS, "user", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "user", "workspaces.1.write", false);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
    expect(canResolved(permissions, "workspaces.1.write")).toBe(false);
  });

  test("includes the built-in self permission with the lowest weight", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.grantPermission(WS, "user", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, SELF_PERMISSIONS_PERMISSION)).toBe(true);
    expect(weightOf(permissions, SELF_PERMISSIONS_PERMISSION)).toBe(
      Math.min(...permissions.map((entry) => entry.weight)),
    );
  });

  test("an explicit deny overrides the built-in self permission", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.grantPermission(
      WS,
      "user",
      SELF_PERMISSIONS_PERMISSION,
      false,
    );

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, SELF_PERMISSIONS_PERMISSION)).toBe(false);
  });

  test("assigns deterministic, strictly descending weights", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["staff"]));
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.grantPermission(WS, "user", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "staff", "workspaces.*", true);
    await adapter.grantPermission(WS, "staff", "account.active", true);

    const permissions = await resolve(adapter, "user");
    const weights = permissions.map((entry) => entry.weight);

    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1] as number);
    }
    expect(new Set(weights).size).toBe(weights.length);
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
    expect(canResolved(a, "workspaces.1.read")).toBe(false);
  });

  test("a direct grant outranks an inherited grant", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["staff"]));
    await adapter.saveSubject(WS, subject("staff"));
    await adapter.grantPermission(WS, "user", "workspaces.1.read", false);
    await adapter.grantPermission(WS, "staff", "workspaces.1.read", true);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, "workspaces.1.read")).toBe(false);
    expect(weightOf(permissions, "workspaces.1.read")).toBeDefined();
  });

  test("a closer parent outranks a more distant parent", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user", ["near"]));
    await adapter.saveSubject(WS, subject("near", ["far"]));
    await adapter.saveSubject(WS, subject("far"));
    await adapter.grantPermission(WS, "near", "workspaces.1.read", true);
    await adapter.grantPermission(WS, "far", "workspaces.1.read", false);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, "workspaces.1.read")).toBe(true);
  });

  test("a more specific permission outranks a broader wildcard", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.grantPermission(WS, "user", "workspaces.*", true);
    await adapter.grantPermission(WS, "user", "workspaces.1.read", false);

    const permissions = await resolve(adapter, "user");

    expect(canResolved(permissions, "workspaces.1.read")).toBe(false);
    expect(weightOf(permissions, "workspaces.1.read")).toBeGreaterThan(
      weightOf(permissions, "workspaces.*") as number,
    );
  });

  test("does not persist weights or the built-in grant", async () => {
    const adapter = new VeguiPermsMemoryAdapter();
    await adapter.saveSubject(WS, subject("user"));
    await adapter.grantPermission(WS, "user", "workspaces.1.read", true);

    await resolve(adapter, "user");

    const grants = await adapter.findSubjectGrants(WS, "user");
    expect(grants).toEqual([
      {
        workspaceId: WS,
        subjectId: "user",
        permission: "workspaces.1.read",
        value: true,
      },
    ]);
  });
});
