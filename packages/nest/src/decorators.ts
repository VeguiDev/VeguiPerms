import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type {
  SubjectType,
  Ability as VPermsAbility,
  Subject as VPermsSubject,
} from "vperms";
import { MISSING_CONTEXT_MESSAGE } from "./messages";
import type { VpermsRequest } from "./types";

export const PERMISSION_METADATA = Symbol("vperms:permission");
export const ANY_PERMISSION_METADATA = Symbol("vperms:anyPermission");

export type PermissionBuilder = (req: Request) => string | Promise<string>;

export type PermissionInput = string | PermissionBuilder;

/**
 * Requires every listed permission. Decorators only store metadata; the global
 * `VPermsGuard` performs the authorization.
 */
export function Permission(
  ...permissions: PermissionInput[]
): MethodDecorator & ClassDecorator {
  return SetMetadata(PERMISSION_METADATA, permissions) as MethodDecorator &
    ClassDecorator;
}

/**
 * Requires at least one of the listed permissions. Decorators only store
 * metadata; the global `VPermsGuard` performs the authorization.
 */
export function AnyPermission(
  ...permissions: PermissionInput[]
): MethodDecorator & ClassDecorator {
  return SetMetadata(ANY_PERMISSION_METADATA, permissions) as MethodDecorator &
    ClassDecorator;
}

function requestOf(context: ExecutionContext): VpermsRequest {
  return context.switchToHttp().getRequest<VpermsRequest>();
}

/**
 * Injects the request ability hydrated by `VPermsGuard`. Never resolves the
 * principal or touches the adapter.
 */
export const Ability = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VPermsAbility => {
    const ability = requestOf(context).ability;
    if (!ability) {
      throw new Error(MISSING_CONTEXT_MESSAGE);
    }
    return ability;
  },
);

/**
 * Injects the subject hydrated by `VPermsGuard`. Never resolves the principal
 * or touches the adapter.
 */
export const Subject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VPermsSubject | undefined =>
    requestOf(context).subject,
);

/**
 * Injects the subject type hydrated by `VPermsGuard`. Never resolves the
 * principal or touches the adapter.
 */
export const Kind = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SubjectType | undefined =>
    requestOf(context).kind,
);
