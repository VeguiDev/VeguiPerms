import {
  createAbility,
  createVPerms as createClientVPerms,
  type PermissionAbility,
  type Principal,
  type ResolvedSubject,
  type SubjectId,
  type VPermsClient,
  type VPermsConfig,
} from "@vperms/client";
import type { ReactNode } from "react";
import { cache as reactCache } from "react";
import { AbilityProvider } from "../client/provider";
import { type AbilityProps, abilityAllows } from "../shared";

/**
 * Wraps a function with a request/render-scoped cache. Defaults to React's
 * `cache`, so a Server Component tree resolves each subject once. Supply a
 * custom wrapper (e.g. AsyncLocalStorage-based) in non-React server runtimes.
 */
export type CacheWrapper = <Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
) => (...args: Args) => Result;

export interface ServerVPermsConfig extends VPermsConfig {
  cache?: CacheWrapper;
}

/**
 * A VeguiPerms instance configured for React Server Components. The current
 * subject and ability are cached per request/render.
 */
export interface ServerVPerms {
  client: VPermsClient;
  getResolvedSubject: (
    subjectId?: SubjectId | Principal,
  ) => Promise<ResolvedSubject>;
  getAbility: (subjectId?: SubjectId | Principal) => Promise<PermissionAbility>;
  Provider: (props: { children?: ReactNode }) => Promise<ReactNode>;
  Ability: (props: AbilityProps) => Promise<ReactNode>;
}

export const MISSING_INSTANCE_MESSAGE =
  "@vperms/react: call createVPerms() on the server before using <ServerAbility>, <Provider> or the standalone getAbility() helper.";

let defaultInstance: ServerVPerms | null = null;

/**
 * Creates a VeguiPerms instance for React Server Components.
 *
 * `getResolvedSubject` and `getAbility` are wrapped in the request-scoped
 * cache (React's `cache` by default), so every Server Component in the same
 * render reuses a single resolved subject without extra requests.
 *
 * The most recently created instance also becomes the module default used by
 * the standalone `<ServerAbility>` / `<Provider>` / `getAbility()` exports.
 */
export function createVPerms(
  origin: string,
  config: ServerVPermsConfig = {},
): ServerVPerms {
  const { cache = reactCache, ...clientConfig } = config;
  const client = createClientVPerms(origin, clientConfig);

  const cachedGetResolvedSubject = cache(
    (subjectId: SubjectId | Principal | undefined) =>
      client.getResolvedSubject(subjectId),
  );

  const cachedGetAbility = cache(
    async (subjectId: SubjectId | Principal | undefined) =>
      createAbility(await cachedGetResolvedSubject(subjectId)),
  );

  const getResolvedSubject = (
    subjectId?: SubjectId | Principal,
  ): Promise<ResolvedSubject> => cachedGetResolvedSubject(subjectId);

  const getAbility = (
    subjectId?: SubjectId | Principal,
  ): Promise<PermissionAbility> => cachedGetAbility(subjectId);

  const Provider = async ({
    children,
  }: {
    children?: ReactNode;
  }): Promise<ReactNode> => {
    const subject = await getResolvedSubject();
    return <AbilityProvider subject={subject}>{children}</AbilityProvider>;
  };

  const Ability = async (props: AbilityProps): Promise<ReactNode> => {
    const ability = await getAbility();
    return abilityAllows(ability, props)
      ? props.children
      : (props.fallback ?? null);
  };

  const instance: ServerVPerms = {
    client,
    getResolvedSubject,
    getAbility,
    Provider,
    Ability,
  };
  defaultInstance = instance;

  return instance;
}

function requireInstance(): ServerVPerms {
  if (defaultInstance === null) {
    throw new Error(MISSING_INSTANCE_MESSAGE);
  }

  return defaultInstance;
}

export async function getResolvedSubject(
  subjectId?: SubjectId | Principal,
): Promise<ResolvedSubject> {
  return requireInstance().getResolvedSubject(subjectId);
}

export async function getAbility(
  subjectId?: SubjectId | Principal,
): Promise<PermissionAbility> {
  return requireInstance().getAbility(subjectId);
}

export async function Provider(props: {
  children?: ReactNode;
}): Promise<ReactNode> {
  return requireInstance().Provider(props);
}

export async function ServerAbility(props: AbilityProps): Promise<ReactNode> {
  const ability = await getAbility();
  return abilityAllows(ability, props)
    ? props.children
    : (props.fallback ?? null);
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
export type { AbilityCheck, AbilityProps } from "../shared";
export { abilityAllows } from "../shared";
export { ServerAbility as Ability };
