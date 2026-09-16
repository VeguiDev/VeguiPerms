import { describe, expect, test } from "bun:test";
import type { Subject } from "vperms";
import {
  canResolved,
  ResolvedSubjectSchema,
  SubjectNotFoundError,
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";

const DEFAULTS = {
  global: ["everyone"],
  byType: { [SubjectType.User]: ["users"] },
};

function subject(
  id: string,
  parents: string[] = [],
  type = SubjectType.Group,
): Subject {
  return { id, type, parents };
}

async function seed(): Promise<VeguiPermsMemoryAdapter> {
  const adapter = new VeguiPermsMemoryAdapter();
  await adapter.saveSubject(
    WS,
    subject("user", ["staff", "!everyone"], SubjectType.User),
  );
  await adapter.saveSubject(WS, subject("staff", ["org"]));
  await adapter.saveSubject(WS, subject("org"));
  await adapter.saveSubject(WS, subject("users"));
  await adapter.saveSubject(WS, subject("everyone"));

  await adapter.grantPermission(WS, "user", "profile.read", true);
  await adapter.grantPermission(WS, "user", "profile.write", false);
  await adapter.grantPermission(WS, "staff", "workspaces.1.read", true);
  await adapter.grantPermission(WS, "org", "workspaces.*", true);
  await adapter.grantPermission(WS, "org", "account.active", false);
  await adapter.grantPermission(WS, "users", "workspaces.2.read", false);
  await adapter.grantPermission(WS, "everyone", "admin.*", true);
  return adapter;
}

function service(adapter: VeguiPermsMemoryAdapter): VeguiPermsService {
  return new VeguiPermsService({ adapter, defaultParents: DEFAULTS });
}

describe("VeguiPermsService.resolvePermissions", () => {
  test("returns a JSON-safe resolved subject DTO", async () => {
    const adapter = await seed();
    const dto = await service(adapter).resolvePermissions(WS, "user");

    expect(dto.id).toBe("user");
    expect(dto.type).toBe(SubjectType.User);
    expect(dto.parents).toEqual(["staff", "!everyone"]);
    expect(dto.permissions.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
    expect(ResolvedSubjectSchema.safeParse(dto).success).toBe(true);
  });

  test("includes weights on every permission", async () => {
    const adapter = await seed();
    const dto = await service(adapter).resolvePermissions(WS, "user");

    for (const entry of dto.permissions) {
      expect(typeof entry.permission).toBe("string");
      expect(typeof entry.value).toBe("boolean");
      expect(typeof entry.weight).toBe("number");
    }
  });

  test("throws SubjectNotFoundError for an unknown subject", async () => {
    const adapter = await seed();
    await expect(
      service(adapter).resolvePermissions(WS, "ghost"),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  test("accepts a Principal", async () => {
    const adapter = await seed();
    const principal = { getSubjectId: () => "user" };
    const dto = await service(adapter).resolvePermissions(WS, principal);

    expect(dto.id).toBe("user");
  });
});

describe("canResolved matches can", () => {
  const permissions = [
    "profile.read",
    "profile.write",
    "workspaces.1.read",
    "workspaces.2.read",
    "workspaces.9.read",
    "workspaces.9.write",
    "account.active",
    "admin.anything",
    "unknown.permission",
    "vperms.subject.me.permissions",
  ];

  test("for every resolved permission", async () => {
    const adapter = await seed();
    const svc = service(adapter);
    const dto = await svc.resolvePermissions(WS, "user");

    for (const permission of permissions) {
      const expected = await svc.can(WS, "user", permission);
      expect(canResolved(dto.permissions, permission)).toBe(expected);
    }
  });

  test("for the anonymous subject", async () => {
    const adapter = await seed();
    await adapter.saveSubject(WS, {
      id: "anonymous",
      type: SubjectType.Anon,
      parents: [],
    });
    const svc = service(adapter);
    const dto = await svc.resolvePermissions(WS, "anonymous");

    for (const permission of permissions) {
      const expected = await svc.can(WS, "anonymous", permission);
      expect(canResolved(dto.permissions, permission)).toBe(expected);
    }
  });

  test("self permission defaults to allowed and is overridable", async () => {
    const adapter = await seed();
    const svc = service(adapter);

    expect(await svc.can(WS, "user", "vperms.subject.me.permissions")).toBe(
      true,
    );

    await svc.setPermission(WS, "user", "vperms.subject.me.permissions", false);
    const dto = await svc.resolvePermissions(WS, "user");

    expect(await svc.can(WS, "user", "vperms.subject.me.permissions")).toBe(
      false,
    );
    expect(canResolved(dto.permissions, "vperms.subject.me.permissions")).toBe(
      false,
    );
  });
});

describe("ResolvedSubjectSchema", () => {
  test("accepts a resolved subject", () => {
    const result = ResolvedSubjectSchema.safeParse({
      id: "user",
      type: "user",
      parents: [],
      permissions: [
        { permission: "workspaces.1.read", value: true, weight: 100 },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("rejects a non-numeric weight", () => {
    const result = ResolvedSubjectSchema.safeParse({
      id: "user",
      type: "user",
      parents: [],
      permissions: [{ permission: "a.b", value: true, weight: "high" }],
    });

    expect(result.success).toBe(false);
  });

  test("rejects an invalid permission pattern", () => {
    const result = ResolvedSubjectSchema.safeParse({
      id: "user",
      type: "user",
      parents: [],
      permissions: [{ permission: "", value: true, weight: 1 }],
    });

    expect(result.success).toBe(false);
  });

  test("rejects an unknown subject type", () => {
    const result = ResolvedSubjectSchema.safeParse({
      id: "user",
      type: "robot",
      parents: [],
      permissions: [],
    });

    expect(result.success).toBe(false);
  });
});
