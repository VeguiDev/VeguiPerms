import { describe, expect, test } from "bun:test";
import * as VPermsReact from "@vperms/react";
import { ServerAbility } from "@vperms/react/server";

const entry = VPermsReact as unknown as Record<string, unknown>;

describe("universal Ability export (react-server condition)", () => {
  test("the server entrypoint is selected", () => {
    expect(entry.Ability).toBe(ServerAbility);
  });

  test("client-only APIs are absent", () => {
    expect("useAbility" in entry).toBe(false);
    expect("AbilityProvider" in entry).toBe(false);
    expect("ClientAbility" in entry).toBe(false);
  });

  test("server APIs are present", () => {
    expect(typeof entry.getAbility).toBe("function");
    expect(typeof entry.getResolvedSubject).toBe("function");
    expect(typeof entry.createVPerms).toBe("function");
    expect(typeof entry.ServerAbility).toBe("function");
  });
});
