import type { Request, RequestHandler } from "express";
import type { RequestAbility } from "./ability";

export type PermissionBuilder = (req: Request) => string | Promise<string>;

export type PermissionInput = string | PermissionBuilder;

const MISSING_ABILITY_MESSAGE =
  "@vperms/express: req.ability is not available. Register vpermsMiddleware() before hasPermission() or hasAnyPermission().";

function requireAbility(req: Request): RequestAbility {
  const ability = req.ability;
  if (!ability) {
    throw new Error(MISSING_ABILITY_MESSAGE);
  }
  return ability;
}

function resolvePermission(
  req: Request,
  input: PermissionInput,
): string | Promise<string> {
  return typeof input === "function" ? input(req) : input;
}

export function hasPermission(
  ...permissions: PermissionInput[]
): RequestHandler {
  return async (req, res, next) => {
    try {
      const ability = requireAbility(req);
      for (const input of permissions) {
        const permission = await resolvePermission(req, input);
        if (!(await ability.can(permission))) {
          res.sendStatus(403);
          return;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function hasAnyPermission(
  ...permissions: PermissionInput[]
): RequestHandler {
  return async (req, res, next) => {
    try {
      const ability = requireAbility(req);
      for (const input of permissions) {
        const permission = await resolvePermission(req, input);
        if (await ability.can(permission)) {
          next();
          return;
        }
      }
      res.sendStatus(403);
    } catch (error) {
      next(error);
    }
  };
}
