import { describe, expect, test } from "bun:test";
import {
  PermissionSchema,
  SubjectSchema,
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";
const USER = "user";

const INVALID_PERMISSIONS = [
  "",
  ".",
  "workspaces..read",
  ".workspaces.read",
  "workspaces.",
];

function service(): VeguiPermsService {
  return new VeguiPermsService({ adapter: new VeguiPermsMemoryAdapter() });
}

describe("PermissionSchema", () => {
  test("rejects structurally invalid permission patterns", () => {
    for (const permission of INVALID_PERMISSIONS) {
      expect(PermissionSchema.safeParse(permission).success).toBe(false);
    }
  });

  test("accepts valid permission patterns", () => {
    const valid = [
      "workspaces",
      "workspaces.1.read",
      "workspaces.*",
      "workspaces.*.read",
      "*",
    ];
    for (const permission of valid) {
      expect(PermissionSchema.safeParse(permission).success).toBe(true);
    }
  });
});

describe("SubjectSchema", () => {
  test("requires valid subject data", () => {
    expect(
      SubjectSchema.safeParse({
        id: "user",
        type: SubjectType.User,
        parents: ["team"],
      }).success,
    ).toBe(true);

    expect(
      SubjectSchema.safeParse({ id: "", type: SubjectType.User, parents: [] })
        .success,
    ).toBe(false);

    expect(
      SubjectSchema.safeParse({
        id: "user",
        type: "banana",
        parents: [],
      }).success,
    ).toBe(false);

    expect(
      SubjectSchema.safeParse({
        id: "user",
        type: SubjectType.User,
        parents: [""],
      }).success,
    ).toBe(false);

    expect(
      SubjectSchema.safeParse({
        id: "user",
        type: SubjectType.User,
        parents: "team",
      }).success,
    ).toBe(false);
  });
});

describe("VeguiPermsService validation", () => {
  test("rejects empty workspace and subject ids", async () => {
    const vperms = service();

    await expect(vperms.can("", USER, "workspaces.1.read")).rejects.toThrow();
    await expect(vperms.can(WS, "", "workspaces.1.read")).rejects.toThrow();
    await expect(vperms.can(WS, USER, "")).rejects.toThrow();
  });

  test("rejects invalid permissions through the service", async () => {
    const vperms = service();

    for (const permission of INVALID_PERMISSIONS) {
      await expect(
        vperms.setPermission(WS, USER, permission, true),
      ).rejects.toThrow();
    }
  });

  test("rejects invalid subject data through the service", async () => {
    const vperms = service();

    await expect(
      vperms.saveSubject(WS, { id: "", type: SubjectType.User, parents: [] }),
    ).rejects.toThrow();

    await expect(
      vperms.saveSubject(WS, {
        id: USER,
        type: "banana" as SubjectType,
        parents: [],
      }),
    ).rejects.toThrow();

    await expect(
      vperms.saveSubject(WS, {
        id: USER,
        type: SubjectType.User,
        parents: [""],
      }),
    ).rejects.toThrow();

    await expect(
      vperms.saveSubject(WS, {
        id: USER,
        type: SubjectType.User,
        parents: "team" as unknown as string[],
      }),
    ).rejects.toThrow();
  });

  test("rejects non-boolean permission values", async () => {
    const vperms = service();

    await expect(
      vperms.setPermission(
        WS,
        USER,
        "workspaces.1.read",
        "yes" as unknown as boolean,
      ),
    ).rejects.toThrow();
  });
});
