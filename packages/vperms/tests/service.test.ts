import { describe, expect, test } from "bun:test";
import type { Subject } from "vperms";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";
const USER = "user";

function group(id: string, parents: string[] = []): Subject {
  return { id, type: SubjectType.Group, parents };
}

async function setup() {
  const adapter = new VeguiPermsMemoryAdapter();
  const vperms = new VeguiPermsService({ adapter });
  return { adapter, vperms };
}

describe("VeguiPermsService.can", () => {
  test("returns true for an exact direct allow", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER));
    await vperms.setPermission(WS, USER, "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(true);
  });

  test("returns false for an exact direct deny", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER));
    await vperms.setPermission(WS, USER, "workspaces.1.read", false);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("returns true for a direct wildcard allow", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER));
    await vperms.setPermission(WS, USER, "workspaces.1.*", true);

    expect(await vperms.can(WS, USER, "workspaces.1.members.invite")).toBe(
      true,
    );
  });

  test("a direct deny overrides an inherited allow", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["team"]));
    await vperms.saveSubject(WS, group("team"));
    await vperms.setPermission(WS, "team", "workspaces.1.read", true);
    await vperms.setPermission(WS, USER, "workspaces.1.read", false);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("a direct allow overrides an inherited deny", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["team"]));
    await vperms.saveSubject(WS, group("team"));
    await vperms.setPermission(WS, "team", "workspaces.1.read", false);
    await vperms.setPermission(WS, USER, "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(true);
  });

  test("returns true for an inherited allow", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["team"]));
    await vperms.saveSubject(WS, group("team"));
    await vperms.setPermission(WS, "team", "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(true);
  });

  test("returns false for an inherited deny", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["team"]));
    await vperms.saveSubject(WS, group("team"));
    await vperms.setPermission(WS, "team", "workspaces.1.read", false);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("a closer parent overrides a more distant ancestor", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["near"]));
    await vperms.saveSubject(WS, group("near", ["far"]));
    await vperms.saveSubject(WS, group("far"));
    await vperms.setPermission(WS, "near", "workspaces.1.read", false);
    await vperms.setPermission(WS, "far", "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("resolves nested parents", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["a"]));
    await vperms.saveSubject(WS, group("a", ["b"]));
    await vperms.saveSubject(WS, group("b", ["c"]));
    await vperms.saveSubject(WS, group("c"));
    await vperms.setPermission(WS, "c", "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(true);
  });

  test("resolves permissions from multiple parents", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["left", "right"]));
    await vperms.saveSubject(WS, group("left"));
    await vperms.saveSubject(WS, group("right"));
    await vperms.setPermission(WS, "right", "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(true);
  });

  test("terminates on cyclic inheritance", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER, ["group"]));
    await vperms.saveSubject(WS, group("group", [USER]));
    await vperms.setPermission(WS, "group", "workspaces.1.read", true);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(true);
  });

  test("returns false when nothing matches", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER));

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("returns false when the subject does not exist", async () => {
    const { vperms } = await setup();

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("matches wildcards in the middle of a permission", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER));
    await vperms.setPermission(WS, USER, "workspaces.*.read", true);

    expect(await vperms.can(WS, USER, "workspaces.7.read")).toBe(true);
    expect(await vperms.can(WS, USER, "workspaces.7.write")).toBe(false);
  });

  test("more specific direct grants win over broader wildcards", async () => {
    const { vperms } = await setup();
    await vperms.saveSubject(WS, group(USER));
    await vperms.setPermission(WS, USER, "workspaces.1.*", true);
    await vperms.setPermission(WS, USER, "workspaces.*.read", false);

    expect(await vperms.can(WS, USER, "workspaces.1.read")).toBe(false);
  });

  test("is deterministic regardless of the parents order", async () => {
    const { vperms: forward } = await setup();
    const { vperms: reversed } = await setup();

    for (const [vperms, parents] of [
      [forward, ["alpha", "beta"]],
      [reversed, ["beta", "alpha"]],
    ] as const) {
      await vperms.saveSubject(WS, group(USER, [...parents]));
      await vperms.saveSubject(WS, group("alpha"));
      await vperms.saveSubject(WS, group("beta"));
      await vperms.setPermission(WS, "alpha", "workspaces.1.read", true);
      await vperms.setPermission(WS, "beta", "workspaces.1.read", false);
    }

    expect(await forward.can(WS, USER, "workspaces.1.read")).toBe(false);
    expect(await reversed.can(WS, USER, "workspaces.1.read")).toBe(false);
  });
});
