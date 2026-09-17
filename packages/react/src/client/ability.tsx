"use client";

import type { ReactNode } from "react";
import { type AbilityProps, abilityAllows } from "../shared";
import { useAbility } from "./use-ability";

/**
 * Client Component conditional renderer. Evaluates synchronously against the
 * ability hydrated by {@link AbilityProvider}.
 */
export function ClientAbility({
  permission,
  permissions,
  any,
  fallback,
  children,
}: AbilityProps): ReactNode {
  const ability = useAbility();
  const allowed = abilityAllows(ability, { permission, permissions, any });

  return allowed ? children : (fallback ?? null);
}
