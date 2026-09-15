import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const workspace = "workspace";
const vperms = new VeguiPermsService({
  adapter: new VeguiPermsMemoryAdapter(),
});

await vperms.saveSubject(workspace, {
  id: "user",
  type: SubjectType.User,
  parents: ["developers"],
});
await vperms.saveSubject(workspace, {
  id: "developers",
  type: SubjectType.Group,
  parents: [],
});
await vperms.setPermission(workspace, "developers", "workspaces.1.*", true);

console.log(
  "user -> workspaces.1.read (inherited allow):",
  await vperms.can(workspace, "user", "workspaces.1.read"),
);
console.log(
  "user -> workspaces.2.read (no match):      ",
  await vperms.can(workspace, "user", "workspaces.2.read"),
);
