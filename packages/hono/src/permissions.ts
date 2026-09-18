import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestAbility, VPermsEnv } from "./ability";
import type { VPermsContext } from "./middleware";

export type PermissionBuilder = (c: VPermsContext) => string | Promise<string>;

export type PermissionInput = string | PermissionBuilder;

const MISSING_ABILITY_MESSAGE =
  '@vperms/hono: c.get("ability") is not available. Register vpermsMiddleware() before hasPermission() or hasAnyPermission().';

function requireAbility(c: VPermsContext): RequestAbility {
  const ability = c.get("ability");
  if (!ability) {
    throw new Error(MISSING_ABILITY_MESSAGE);
  }
  return ability;
}

function resolvePermission(
  c: VPermsContext,
  input: PermissionInput,
): string | Promise<string> {
  return typeof input === "function" ? input(c) : input;
}

export function hasPermission(
  ...permissions: PermissionInput[]
): MiddlewareHandler<VPermsEnv> {
  return createMiddleware<VPermsEnv>(async (c, next) => {
    const ability = requireAbility(c);
    for (const input of permissions) {
      const permission = await resolvePermission(c, input);
      if (!(await ability.can(permission))) {
        return c.body(null, 403);
      }
    }
    await next();
  });
}

export function hasAnyPermission(
  ...permissions: PermissionInput[]
): MiddlewareHandler<VPermsEnv> {
  return createMiddleware<VPermsEnv>(async (c, next) => {
    const ability = requireAbility(c);
    for (const input of permissions) {
      const permission = await resolvePermission(c, input);
      if (await ability.can(permission)) {
        await next();
        return;
      }
    }
    return c.body(null, 403);
  });
}
