import { describe, expect, test } from "bun:test";
import type { PermissionGrant, ResolvedPermissionGrant } from "@vperms/core";
import { compareGrants, permissionSpecificity } from "@vperms/core";

function grant(
  permission: string,
  value = true,
  subjectId = "subject",
  depth?: number,
): PermissionGrant | ResolvedPermissionGrant {
  const base: PermissionGrant = {
    workspaceId: "workspace",
    subjectId,
    permission,
    value,
  };
  return depth === undefined ? base : { ...base, depth };
}

describe("permissionSpecificity", () => {
  test("orders the documented example from most to least specific", () => {
    const ordered = [
      "workspaces.1.read",
      "workspaces.*.read",
      "workspaces.1.*",
      "workspaces.*",
      "*",
    ];

    for (let i = 1; i < ordered.length; i++) {
      const previous = permissionSpecificity(ordered[i - 1] as string);
      const current = permissionSpecificity(ordered[i] as string);
      expect(previous).toBeGreaterThan(current);
    }
  });

  test("exact segments increase specificity and wildcards reduce it", () => {
    expect(permissionSpecificity("workspaces.1.read")).toBeGreaterThan(
      permissionSpecificity("workspaces.1.*"),
    );
    expect(permissionSpecificity("workspaces.1.*")).toBeGreaterThan(
      permissionSpecificity("workspaces.*"),
    );
  });
});

describe("compareGrants", () => {
  test("closer depth wins", () => {
    const close = grant("workspaces.1.read", true, "a", 1);
    const distant = grant("workspaces.1.read", true, "b", 3);
    expect(compareGrants(close, distant)).toBeLessThan(0);
  });

  test("specificity wins within the same depth", () => {
    const specific = grant("workspaces.1.read");
    const broad = grant("workspaces.*");
    expect(compareGrants(specific, broad)).toBeLessThan(0);
  });

  test("deny wins on an otherwise exact tie", () => {
    const deny = grant("workspaces.1.read", false, "subject");
    const allow = grant("workspaces.1.read", true, "subject");
    expect(compareGrants(deny, allow)).toBeLessThan(0);
  });

  test("breaks ties deterministically by subject id", () => {
    const first = grant("workspaces.1.read", true, "alpha");
    const second = grant("workspaces.1.read", true, "beta");
    expect(compareGrants(first, second)).toBeLessThan(0);
    expect(compareGrants(second, first)).toBeGreaterThan(0);
  });
});
