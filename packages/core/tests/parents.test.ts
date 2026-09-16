import { describe, expect, test } from "bun:test";
import type { DefaultParents, Subject } from "@vperms/core";
import { effectiveParentLayers, SubjectType, splitParents } from "@vperms/core";

function subject(
  id: string,
  type: SubjectType,
  parents: string[] = [],
): Subject {
  return { id, type, parents };
}

const USER = SubjectType.User;
const SERVICE = SubjectType.Service;

const DEFAULTS: DefaultParents = {
  global: ["everyone"],
  byType: {
    [SubjectType.User]: ["users"],
    [SubjectType.Service]: ["services"],
  },
};

describe("splitParents", () => {
  test("separates explicit parents from negation directives", () => {
    const { explicit, excluded } = splitParents(["staff", "!everyone"]);

    expect(explicit).toEqual(["staff"]);
    expect([...excluded]).toEqual(["everyone"]);
  });

  test("deduplicates explicit parents", () => {
    const { explicit } = splitParents(["staff", "staff"]);

    expect(explicit).toEqual(["staff"]);
  });

  test("ignores a bare negation prefix", () => {
    const { explicit, excluded } = splitParents(["!"]);

    expect(explicit).toEqual([]);
    expect([...excluded]).toEqual([]);
  });
});

describe("effectiveParentLayers", () => {
  test("returns only explicit parents when no defaults are configured", () => {
    expect(effectiveParentLayers(subject("user", USER, ["staff"]))).toEqual({
      explicit: ["staff"],
      byType: [],
      global: [],
    });
  });

  test("adds the global default parent", () => {
    const layers = effectiveParentLayers(
      subject("user", USER, ["staff"]),
      DEFAULTS,
    );

    expect(layers.global).toEqual(["everyone"]);
  });

  test("adds the default parent for the subject type", () => {
    expect(
      effectiveParentLayers(subject("user", USER), DEFAULTS).byType,
    ).toEqual(["users"]);
    expect(
      effectiveParentLayers(subject("svc", SERVICE), DEFAULTS).byType,
    ).toEqual(["services"]);
    expect(
      effectiveParentLayers(subject("grp", SubjectType.Group), DEFAULTS),
    ).toMatchObject({ byType: [], global: ["everyone"] });
  });

  test("keeps an explicit parent ahead of a same-id default", () => {
    const layers = effectiveParentLayers(
      subject("user", USER, ["users"]),
      DEFAULTS,
    );

    expect(layers).toEqual({
      explicit: ["users"],
      byType: [],
      global: ["everyone"],
    });
  });

  test("deduplicates a parent present in both default sources", () => {
    const layers = effectiveParentLayers(subject("user", USER), {
      global: ["shared"],
      byType: { [USER]: ["shared"] },
    });

    expect(layers).toEqual({
      explicit: [],
      byType: ["shared"],
      global: [],
    });
  });

  test("deduplicates repeated virtual parents within a source", () => {
    const layers = effectiveParentLayers(subject("user", USER), {
      global: ["everyone", "everyone"],
    });

    expect(layers.global).toEqual(["everyone"]);
  });

  test("a negation disables a global default", () => {
    const layers = effectiveParentLayers(
      subject("user", USER, ["staff", "!everyone"]),
      DEFAULTS,
    );

    expect(layers.explicit).toEqual(["staff"]);
    expect(layers.global).toEqual([]);
  });

  test("a negation disables a type default", () => {
    const layers = effectiveParentLayers(
      subject("user", USER, ["!users"]),
      DEFAULTS,
    );

    expect(layers.byType).toEqual([]);
  });

  test("a negation disables the same parent from both default sources", () => {
    const layers = effectiveParentLayers(subject("user", USER, ["!shared"]), {
      global: ["shared"],
      byType: { [USER]: ["shared"] },
    });

    expect(layers.byType).toEqual([]);
    expect(layers.global).toEqual([]);
  });

  test("a negation never removes an explicit parent with the same id", () => {
    const layers = effectiveParentLayers(
      subject("user", USER, ["everyone", "!everyone"]),
      DEFAULTS,
    );

    expect(layers.explicit).toEqual(["everyone"]);
    expect(layers.global).toEqual([]);
  });

  test("negation directives are never treated as parents", () => {
    const layers = effectiveParentLayers(
      subject("user", USER, ["staff", "!users"]),
      DEFAULTS,
    );

    expect(layers.explicit).not.toContain("!users");
    expect(layers.byType).not.toContain("!users");
    expect(layers.global).not.toContain("!users");
  });
});
