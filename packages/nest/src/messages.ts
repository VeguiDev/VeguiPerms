/**
 * Raised when VeguiPerms request state is read before it has been hydrated.
 *
 * This is a configuration error: the global `VPermsGuard` (registered by
 * `VPermsModule.forRoot(...)`) must run before any decorator or `AbilityGuard`
 * reads `req.ability`, `req.subject` or `req.kind`.
 */
export const MISSING_CONTEXT_MESSAGE =
  "@vperms/nest: the VeguiPerms request context is unavailable. Register VPermsModule.forRoot(...) so the global VPermsGuard hydrates the request before using @Ability(), @Subject(), @Kind() or AbilityGuard.";
