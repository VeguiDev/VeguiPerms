"use client";

import type { PermissionAbility } from "@vperms/client";
import * as React from "react";

let abilityContext: React.Context<PermissionAbility | null> | null = null;

/**
 * Lazily creates the ability context.
 *
 * The context is only ever created on the client. Deferring `createContext`
 * keeps this module safe to import from the `react-server` entrypoint, where
 * React's server build does not expose `createContext`.
 */
export function getAbilityContext(): React.Context<PermissionAbility | null> {
  if (abilityContext === null) {
    abilityContext = React.createContext<PermissionAbility | null>(null);
  }

  return abilityContext;
}
