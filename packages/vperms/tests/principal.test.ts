import { describe, expect, test } from "bun:test";
import type { Principal } from "vperms";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";
const USER = "user-1";

class UserPrincipal implements Principal {
  constructor(private readonly id: string) {}

  getSubjectId(): string {
    return this.id;
  }
}

class InvalidPrincipal implements Principal {
  getSubjectId(): string {
    return "";
  }
}

async function setup() {
  const adapter = new VeguiPermsMemoryAdapter();
  const vperms = new VeguiPermsService({ adapter });
  await vperms.saveSubject(WS, {
    id: USER,
    type: SubjectType.User,
    parents: [],
  });
  return { adapter, vperms };
}

describe("VeguiPermsService principals", () => {
  test("resolves a Principal to its subject id", async () => {
    const { vperms } = await setup();
    const user = new UserPrincipal(USER);
    await vperms.setPermission(WS, USER, "posts.read", true);

    expect(await vperms.can(WS, user, "posts.read")).toBe(true);
  });

  test("a Principal behaves exactly like the raw subject id", async () => {
    const { vperms } = await setup();
    const user = new UserPrincipal(USER);
    await vperms.setPermission(WS, user, "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
    expect(await vperms.can(WS, user, "posts.read")).toBe(true);
    expect(await vperms.can(WS, USER, "posts.write")).toBe(false);
  });

  test("raw subject ids keep working for every method", async () => {
    const { vperms } = await setup();

    await vperms.setPermission(WS, USER, "posts.read", true);
    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);

    expect(await vperms.unsetPermission(WS, USER, "posts.read")).toBe(true);
    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);

    expect(await vperms.deleteSubject(WS, USER)).toBe(true);
    expect(await vperms.deleteSubject(WS, USER)).toBe(false);
  });

  test("accepts a Principal in setPermission, unsetPermission and deleteSubject", async () => {
    const { vperms } = await setup();
    const user = new UserPrincipal(USER);

    await vperms.setPermission(WS, user, "posts.read", true);
    expect(await vperms.can(WS, user, "posts.read")).toBe(true);

    expect(await vperms.unsetPermission(WS, user, "posts.read")).toBe(true);
    expect(await vperms.can(WS, user, "posts.read")).toBe(false);

    expect(await vperms.deleteSubject(WS, user)).toBe(true);
  });

  test("rejects a Principal that resolves to an invalid subject id", async () => {
    const { vperms } = await setup();
    const invalid = new InvalidPrincipal();

    await expect(vperms.can(WS, invalid, "posts.read")).rejects.toThrow();
    await expect(
      vperms.setPermission(WS, invalid, "posts.read", true),
    ).rejects.toThrow();
    await expect(
      vperms.unsetPermission(WS, invalid, "posts.read"),
    ).rejects.toThrow();
    await expect(vperms.deleteSubject(WS, invalid)).rejects.toThrow();
  });
});
