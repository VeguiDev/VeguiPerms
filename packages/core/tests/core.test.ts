import { describe, expect, test } from "bun:test";
import { matchPermission } from "@vperms/core";

describe("matchPermission", () => {
  test("exact match", () => {
    expect(matchPermission("workspaces.create", "workspaces.create")).toBe(
      true,
    );
    expect(matchPermission("workspaces.1.read", "workspaces.1.read")).toBe(
      true,
    );
  });

  test("exact mismatch", () => {
    expect(matchPermission("workspaces.create", "workspaces.delete")).toBe(
      false,
    );
    expect(matchPermission("workspaces.1.read", "workspaces.2.read")).toBe(
      false,
    );
  });

  test("trailing wildcard matches remaining segments", () => {
    expect(matchPermission("workspaces.1.*", "workspaces.1.read")).toBe(true);
    expect(
      matchPermission("workspaces.1.*", "workspaces.1.members.invite"),
    ).toBe(true);
    expect(matchPermission("workspaces.*", "workspaces.7.create")).toBe(true);
    expect(matchPermission("*", "workspaces.1.read")).toBe(true);
  });

  test("trailing wildcard matches zero segments", () => {
    expect(matchPermission("workspaces.1.*", "workspaces.1")).toBe(true);
  });

  test("wildcard in the middle matches a single segment", () => {
    expect(matchPermission("workspaces.*.read", "workspaces.7.read")).toBe(
      true,
    );
    expect(matchPermission("workspaces.*.read", "workspaces.7.create")).toBe(
      false,
    );
  });

  test("different depths do not match", () => {
    expect(matchPermission("workspaces.1.read", "workspaces.1")).toBe(false);
    expect(matchPermission("workspaces.1", "workspaces.1.read")).toBe(false);
  });

  test("wildcard does not cross unrelated prefixes", () => {
    expect(matchPermission("workspaces.1.*", "workspaces.2.read")).toBe(false);
    expect(matchPermission("workspaces.1.*", "billing.1.read")).toBe(false);
  });
});
