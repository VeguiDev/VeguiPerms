"use client";

import {
  createVPerms as createClientVPerms,
  type VPermsClient,
  type VPermsConfig,
} from "@vperms/client";
import { ClientAbility } from "./ability";
import { getAbilityContext } from "./context";
import { AbilityProvider } from "./provider";
import { useAbility } from "./use-ability";

/**
 * A VeguiPerms instance configured for React Client Components. It reuses the
 * vanilla `@vperms/client` for loading and adds provider/hook/component APIs.
 */
export interface ClientVPerms {
  client: VPermsClient;
  getResolvedSubject: VPermsClient["getResolvedSubject"];
  getAbility: VPermsClient["getAbility"];
  Provider: typeof AbilityProvider;
  Ability: typeof ClientAbility;
  useAbility: typeof useAbility;
}

/**
 * Creates a React-aware VeguiPerms instance backed by the HTTP client at
 * `origin`. The returned `Provider`, `Ability` and `useAbility` are bound to
 * the same configuration, so consumers configure VeguiPerms once.
 */
export function createVPerms(
  origin: string,
  config: VPermsConfig = {},
): ClientVPerms {
  const client = createClientVPerms(origin, config);

  return {
    client,
    getResolvedSubject: (subjectId) => client.getResolvedSubject(subjectId),
    getAbility: (subjectId) => client.getAbility(subjectId),
    Provider: AbilityProvider,
    Ability: ClientAbility,
    useAbility,
  };
}

export type {
  FetchLike,
  Principal,
  ResolvedPermission,
  ResolvedSubject,
  Subject,
  SubjectId,
  SubjectResolver,
  VPermsClient,
  VPermsConfig,
} from "@vperms/client";
export {
  createAbility,
  fetchResolvedSubject,
  PermissionAbility,
  VPermsHttpError,
} from "@vperms/client";
export type { AbilityProps } from "../shared";
export type { AbilityProviderProps } from "./provider";
export { MISSING_PROVIDER_MESSAGE } from "./use-ability";
export {
  AbilityProvider,
  ClientAbility,
  ClientAbility as Ability,
  getAbilityContext,
  useAbility,
};
