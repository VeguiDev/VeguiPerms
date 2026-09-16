import { describe, expect, test } from "bun:test";
import type { DefaultParents, Subject } from "vperms";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";
const USER = "user";

const DEFAULTS: DefaultParents = {
  global: ["everyone"],
  byType: {
    [SubjectType.User]: ["users"],
    [SubjectType.Service]: ["services"],
  },
};

class CountingAdapter extends VeguiPermsMemoryAdapter {
  readonly subjectLookups: string[] = [];

  override async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<Subject | null> {
    this.subjectLookups.push(subjectId);
    return super.findSubject(workspaceId, subjectId);
  }
}

function user(id: string, parents: string[] = []): Subject {
  return { id, type: SubjectType.User, parents };
}

function group(id: string, parents: string[] = []): Subject {
  return { id, type: SubjectType.Group, parents };
}

function setup(defaultParents?: DefaultParents) {
  const adapter = new VeguiPermsMemoryAdapter();
  const vperms = new VeguiPermsService({ adapter, defaultParents });
  return { adapter, vperms };
}

function countingSetup(defaultParents?: DefaultParents) {
  const adapter = new CountingAdapter();
  const vperms = new VeguiPermsService({ adapter, defaultParents });
  return { adapter, vperms };
}

function countLookups(adapter: CountingAdapter, id: string): number {
  return adapter.subjectLookups.filter((lookup) => lookup === id).length;
}

describe("global default parents", () => {
  test("a global default parent grants an inherited permission", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("a global default applies to every subject type", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, group("team"));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, "team", "posts.read")).toBe(true);
  });
});

describe("type default parents", () => {
  test("a type default parent grants an inherited permission", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER));
    await vperms.saveSubject(WS, group("users"));
    await vperms.setPermission(WS, "users", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("a type default only applies to subjects of that type", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, group("team"));
    await vperms.saveSubject(WS, group("users"));
    await vperms.setPermission(WS, "users", "posts.read", true);

    expect(await vperms.can(WS, "team", "posts.read")).toBe(false);
  });

  test("a parent's own type default applies to that parent", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["service-a"]));
    await vperms.saveSubject(WS, {
      id: "service-a",
      type: SubjectType.Service,
      parents: [],
    });
    await vperms.saveSubject(WS, group("services"));
    await vperms.setPermission(WS, "services", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });
});

describe("layer priority", () => {
  test("an explicit parent beats a type default", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["staff"]));
    await vperms.saveSubject(WS, group("staff"));
    await vperms.saveSubject(WS, group("users"));
    await vperms.setPermission(WS, "staff", "posts.read", true);
    await vperms.setPermission(WS, "users", "posts.read", false);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("a type default beats a global default", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER));
    await vperms.saveSubject(WS, group("users"));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "users", "posts.read", true);
    await vperms.setPermission(WS, "everyone", "posts.read", false);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("a global default is consulted when nothing matches earlier", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["staff"]));
    await vperms.saveSubject(WS, group("staff"));
    await vperms.saveSubject(WS, group("users"));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "staff", "posts.write", true);
    await vperms.setPermission(WS, "users", "posts.write", true);
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("direct permissions take priority over every inherited layer", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["staff"]));
    await vperms.saveSubject(WS, group("staff"));
    await vperms.saveSubject(WS, group("users"));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "staff", "posts.read", true);
    await vperms.setPermission(WS, "users", "posts.read", true);
    await vperms.setPermission(WS, "everyone", "posts.read", true);
    await vperms.setPermission(WS, USER, "posts.read", false);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });
});

describe("negated virtual parents", () => {
  test("disables a global default", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["!everyone"]));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });

  test("disables a type default", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["!users"]));
    await vperms.saveSubject(WS, group("users"));
    await vperms.setPermission(WS, "users", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });

  test("disables the same id from both virtual sources", async () => {
    const { vperms } = setup({
      global: ["shared"],
      byType: { [SubjectType.User]: ["shared"] },
    });
    await vperms.saveSubject(WS, user(USER, ["!shared"]));
    await vperms.saveSubject(WS, group("shared"));
    await vperms.setPermission(WS, "shared", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });

  test("does not remove an explicitly assigned parent with the same id", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["everyone", "!everyone"]));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("negated ids and duplicates are never looked up", async () => {
    const { vperms, adapter } = countingSetup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["staff", "staff", "!everyone"]));
    await vperms.saveSubject(WS, group("staff"));
    await vperms.setPermission(WS, "staff", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
    expect(countLookups(adapter, "staff")).toBe(1);
    expect(countLookups(adapter, "!everyone")).toBe(0);
    expect(countLookups(adapter, "everyone")).toBe(0);
  });

  test("a duplicated default parent is only looked up once", async () => {
    const { vperms, adapter } = countingSetup({
      byType: { [SubjectType.User]: ["users", "users"] },
    });
    await vperms.saveSubject(WS, user(USER));
    await vperms.saveSubject(WS, group("users"));
    await vperms.setPermission(WS, "users", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
    expect(countLookups(adapter, "users")).toBe(1);
  });
});

describe("negation propagation", () => {
  test("a root negation also disables the default for visited subjects", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["!everyone", "staff"]));
    await vperms.saveSubject(WS, group("staff"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });

  test("a negated default is still reachable through an explicit parent", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["!everyone", "staff"]));
    await vperms.saveSubject(WS, group("staff", ["everyone"]));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("a visited subject's own negation applies to its defaults", async () => {
    const { vperms } = setup({
      byType: { [SubjectType.Group]: ["groups"] },
    });
    await vperms.saveSubject(WS, user(USER, ["staff"]));
    await vperms.saveSubject(WS, group("staff", ["!groups"]));
    await vperms.setPermission(WS, "groups", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });
});

describe("virtual parent edge cases", () => {
  test("keeps cycle protection through default parents", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["group"]));
    await vperms.saveSubject(WS, group("group", [USER]));
    await vperms.saveSubject(WS, group("everyone"));
    await vperms.setPermission(WS, "everyone", "posts.read", true);

    expect(await vperms.can(WS, USER, "posts.read")).toBe(true);
  });

  test("returns false when only unrelated defaults exist", async () => {
    const { vperms } = setup(DEFAULTS);
    await vperms.saveSubject(WS, user(USER, ["!everyone", "!users"]));

    expect(await vperms.can(WS, USER, "posts.read")).toBe(false);
  });

  test("rejects negation directives in the default parents configuration", () => {
    expect(
      () =>
        new VeguiPermsService({
          adapter: new VeguiPermsMemoryAdapter(),
          defaultParents: { global: ["!everyone"] },
        }),
    ).toThrow();

    expect(
      () =>
        new VeguiPermsService({
          adapter: new VeguiPermsMemoryAdapter(),
          defaultParents: { byType: { [SubjectType.User]: ["!users"] } },
        }),
    ).toThrow();
  });
});
