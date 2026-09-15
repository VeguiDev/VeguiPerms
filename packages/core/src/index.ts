export { VeguiPermsAdapter } from "./adapter";
export { matchesPattern, matchPermission } from "./engine";
export { VeguiPermsMemoryAdapter } from "./memory";
export type { PermissionGrant, ResolvedPermissionGrant } from "./permission";
export { resolveInheritedPermissions } from "./resolution";
export { compareGrants, depthOf, permissionSpecificity } from "./specificity";
export type { Subject } from "./subject";
export { SubjectType } from "./subject";
