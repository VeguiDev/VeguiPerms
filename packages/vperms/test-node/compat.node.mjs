import assert from "node:assert/strict";
import test from "node:test";
import { matchPermission } from "vperms";

test("matchPermission works under Node.js", () => {
  assert.equal(matchPermission("workspaces.1.*", "workspaces.1.read"), true);
  assert.equal(
    matchPermission("workspaces.1.*", "workspaces.1.members.invite"),
    true,
  );
  assert.equal(matchPermission("workspaces.*.read", "workspaces.7.read"), true);
  assert.equal(matchPermission("workspaces.create", "workspaces.create"), true);

  assert.equal(matchPermission("workspaces.1.*", "workspaces.2.read"), false);
  assert.equal(matchPermission("workspaces.1.read", "workspaces.1"), false);
});
