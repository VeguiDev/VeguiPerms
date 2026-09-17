import type { PermissionAbility } from "@vperms/client";
import type { ReactNode } from "react";

export interface AbilityProps {
  /** A single permission that must be allowed. */
  permission?: string;
  /** Permissions evaluated together according to `any`. */
  permissions?: string[];
  /** Evaluate `permissions` with ANY instead of ALL semantics. */
  any?: boolean;
  /** Rendered instead of `children` when access is denied. */
  fallback?: ReactNode;
  children?: ReactNode;
}

export interface AbilityCheck {
  permission?: string;
  permissions?: string[];
  any?: boolean;
}

/**
 * Synchronously evaluates a resolved ability with short-circuit semantics.
 * All permissions must pass by default; `any` switches to at-least-one.
 */
export function abilityAllows(
  ability: PermissionAbility,
  check: AbilityCheck,
): boolean {
  const required = [...(check.permissions ?? [])];

  if (check.permission !== undefined) {
    required.push(check.permission);
  }

  if (required.length === 0) {
    return true;
  }

  if (check.any) {
    return required.some((permission) => ability.can(permission));
  }

  return required.every((permission) => ability.can(permission));
}
