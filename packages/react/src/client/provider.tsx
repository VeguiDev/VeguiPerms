"use client";

import { createAbility, type ResolvedSubject } from "@vperms/client";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { getAbilityContext } from "./context";

export interface AbilityProviderProps {
  subject: ResolvedSubject;
  children?: ReactNode;
}

/**
 * Client Component provider that hydrates a permission ability from a
 * JSON-safe `ResolvedSubject` snapshot produced on the server.
 */
export function AbilityProvider({ subject, children }: AbilityProviderProps) {
  const ability = useMemo(() => createAbility(subject), [subject]);
  const Context = getAbilityContext();

  return <Context.Provider value={ability}>{children}</Context.Provider>;
}
