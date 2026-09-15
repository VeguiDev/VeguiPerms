import { describe, expect, test } from "bun:test";
import type { PermissionGrant } from "@vperms/core";
import { matchesPattern, matchPermission } from "@vperms/core";

function grant(
  permission: string,
  value = true,
  subjectId = "subject",
): PermissionGrant {
  return { workspaceId: "workspace", subjectId, permission, value };
}

describe("matchesPattern", () => {
  test("matches exact patterns", () => {
    expect(matchesPattern("workspaces.1.read", "workspaces.1.read")).toBe(true);
    expect(matchesPattern("workspaces.1.read", "workspaces.1.write")).toBe(
      false,
    );
    expect(matchesPattern("workspaces.1.read", "workspaces.1")).toBe(false);
    expect(matchesPattern("workspaces.1", "workspaces.1.read")).toBe(false);
  });

  test("trailing wildcard matches several remaining segments", () => {
    expect(matchesPattern("workspaces.1.*", "workspaces.1.read")).toBe(true);
    expect(
      matchesPattern("workspaces.1.*", "workspaces.1.members.invite"),
    ).toBe(true);
    expect(matchesPattern("workspaces.*", "workspaces.7.create")).toBe(true);
    expect(matchesPattern("*", "workspaces.1.read")).toBe(true);
  });

  test("trailing wildcard matches zero remaining segments", () => {
    expect(matchesPattern("workspaces.1.*", "workspaces.1")).toBe(true);
    expect(matchesPattern("workspaces.*", "workspaces")).toBe(true);
    expect(matchesPattern("*", "workspaces")).toBe(true);
  });

  test("middle wildcard matches exactly one segment", () => {
    expect(matchesPattern("workspaces.*.read", "workspaces.7.read")).toBe(true);
    expect(matchesPattern("workspaces.*.read", "workspaces.7")).toBe(false);
    expect(matchesPattern("workspaces.*.read", "workspaces.7.1.read")).toBe(
      false,
    );
  });

  test("wildcard does not cross unrelated prefixes", () => {
    expect(matchesPattern("workspaces.1.*", "workspaces.2.read")).toBe(false);
    expect(matchesPattern("workspaces.1.*", "billing.1.read")).toBe(false);
  });
});

describe("matchPermission", () => {
  test("returns null when no grant matches", () => {
    expect(matchPermission([], "workspaces.1.read")).toBeNull();
    expect(matchPermission([grant("billing.read")], "workspaces.1.read")).toBe(
      null,
    );
  });

  test("returns true for an explicit allow", () => {
    expect(
      matchPermission([grant("workspaces.1.read")], "workspaces.1.read"),
    ).toBe(true);
  });

  test("returns false for an explicit deny", () => {
    expect(
      matchPermission([grant("workspaces.1.read", false)], "workspaces.1.read"),
    ).toBe(false);
  });

  test("an explicit deny is not converted into no-match", () => {
    const result = matchPermission(
      [grant("workspaces.1.read", false)],
      "workspaces.1.read",
    );
    expect(result).not.toBeNull();
    expect(result).toBe(false);
  });

  test("more specific patterns win over broader wildcards", () => {
    expect(
      matchPermission(
        [grant("workspaces.*.read", false), grant("workspaces.1.*", true)],
        "workspaces.1.read",
      ),
    ).toBe(false);
  });

  test("exact patterns win over wildcards", () => {
    expect(
      matchPermission(
        [grant("workspaces.1.read", true), grant("workspaces.*.read", false)],
        "workspaces.1.read",
      ),
    ).toBe(true);
  });

  test("does not mutate the input array", () => {
    const grants = [grant("*"), grant("workspaces.1.read")];
    const before = [...grants];

    matchPermission(grants, "workspaces.1.read");

    expect(grants).toEqual(before);
  });
});
