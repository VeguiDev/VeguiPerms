"use client";

import type { PermissionAbility } from "@vperms/client";
import * as React from "react";
import { getAbilityContext } from "./context";

export const MISSING_PROVIDER_MESSAGE =
  "@vperms/react: useAbility() must be used inside <AbilityProvider> or a configured vperms.Provider. Wrap the client subtree or use await vperms.getAbility() in a Server Component.";

/**
 * Client Component hook that reads the hydrated permission ability.
 *
 * Server Components must use `await vperms.getAbility()` instead.
 */
export function useAbility(): PermissionAbility {
  const ability = React.useContext(getAbilityContext());

  if (ability === null) {
    throw new Error(MISSING_PROVIDER_MESSAGE);
  }

  return ability;
}
