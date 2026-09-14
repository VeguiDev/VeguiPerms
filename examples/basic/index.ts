import { matchPermission } from "vperms";

const granted = "workspaces.1.*";
const requested = "workspaces.1.read";

console.log(`granted:   ${granted}`);
console.log(`requested: ${requested}`);
console.log(`allowed:   ${matchPermission(granted, requested)}`);
