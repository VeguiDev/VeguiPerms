import assert from "node:assert/strict";
import test from "node:test";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

test("VeguiPermsService works under Node.js", async () => {
  const workspace = "workspace";
  const vperms = new VeguiPermsService({
    adapter: new VeguiPermsMemoryAdapter(),
  });

  await vperms.saveSubject(workspace, {
    id: "user",
    type: SubjectType.User,
    parents: ["team"],
  });
  await vperms.saveSubject(workspace, {
    id: "team",
    type: SubjectType.Group,
    parents: [],
  });
  await vperms.setPermission(workspace, "team", "workspaces.1.*", true);

  assert.equal(await vperms.can(workspace, "user", "workspaces.1.read"), true);
  assert.equal(await vperms.can(workspace, "user", "workspaces.2.read"), false);
});
