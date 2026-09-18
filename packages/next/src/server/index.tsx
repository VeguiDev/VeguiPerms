import {
  createAbility,
  type FetchLike,
  type PermissionAbility,
  type Principal,
  type ResolvedSubject,
  type SubjectId,
  type VPermsClient,
} from "@vperms/client";
import { AbilityProvider } from "@vperms/react/client";
import {
  type AbilityProps,
  abilityAllows,
  type CacheWrapper,
  createVPerms as createReactServerVPerms,
} from "@vperms/react/server";
import { headers as nextHeaders } from "next/headers";
import type { ReactNode } from "react";
import { cache as reactCache } from "react";
import {
  exportResolvedSubject,
  resolveRequestContext,
  resolveSubjectId,
  VeguiPermsService,
} from "vperms";
import {
  type BrowserConfig,
  type ClientTransport,
  normalizePrefix,
} from "../shared";
import type { Backend, NextBackend } from "./backends";
import {
  createExternalHandlers,
  createLocalHandlers,
  type NextVPermsHandlers,
} from "./handlers";

export type { AbilityProps } from "@vperms/react/server";
export type {
  BrowserConfig,
  ClientTransport,
  SubjectResolver,
  SubjectResolverResult,
} from "../shared";
export type {
  Backend,
  ExternalBackend,
  ExternalBackendOptions,
  NextBackend,
  NextBackendOptions,
} from "./backends";
export { externalBackend, nextBackend } from "./backends";
export type { NextRouteContext, NextVPermsHandlers } from "./handlers";

export interface NextVPermsConfig {
  backend: Backend;
  /** Path prefix the Next API is mounted at. Defaults to `/vperms`. */
  prefix?: string;
  /** Browser transport for an external backend. Defaults to `proxy`. */
  client?: ClientTransport;
  /** Request/render-scoped cache. Defaults to React's `cache`. */
  cache?: CacheWrapper;
  /** Options applied when the browser loads resolved subjects. */
  browserFetchOptions?: RequestInit;
}

/**
 * A fully isolated Next integration instance. Every configured Ability,
 * Provider, handler and resolver belongs to this instance; there is no
 * module-level default.
 */
export interface NextVPerms {
  backend: Backend;
  prefix: string;
  clientTransport: ClientTransport;
  /**
   * Serializable configuration the browser passes to
   * `createNextVPerms` from `@vperms/next/client`.
   */
  browserConfig: BrowserConfig;
  client?: VPermsClient;
  getResolvedSubject: (
    subjectId?: SubjectId | Principal,
  ) => Promise<ResolvedSubject>;
  getAbility: (subjectId?: SubjectId | Principal) => Promise<PermissionAbility>;
  Provider: (props: { children?: ReactNode }) => Promise<ReactNode>;
  Ability: (props: AbilityProps) => Promise<ReactNode>;
  handlers: NextVPermsHandlers;
}

interface LocalServer {
  service: VeguiPermsService;
  getResolvedSubject: (
    subjectId?: SubjectId | Principal,
  ) => Promise<ResolvedSubject>;
  getAbility: (subjectId?: SubjectId | Principal) => Promise<PermissionAbility>;
  Provider: (props: { children?: ReactNode }) => Promise<ReactNode>;
  Ability: (props: AbilityProps) => Promise<ReactNode>;
}

function createLocalServer(
  backend: NextBackend,
  cache: CacheWrapper,
): LocalServer {
  const service = new VeguiPermsService({
    adapter: backend.adapter,
    defaultParents: backend.defaultParents,
  });

  const cachedContext = cache(async () => {
    const subject = await backend.subjectResolver();
    return resolveRequestContext({
      adapter: backend.adapter,
      service,
      workspaceId: backend.workspace,
      subject,
    });
  });

  const cachedGetResolvedSubject = cache(
    async (subjectId: SubjectId | Principal | undefined) => {
      const context = await cachedContext();
      return exportResolvedSubject({
        service,
        adapter: backend.adapter,
        workspaceId: backend.workspace,
        currentSubjectId: context.id,
        targetSubjectId:
          subjectId === undefined ? "me" : resolveSubjectId(subjectId),
        ability: context.ability,
      });
    },
  );

  const cachedGetAbility = cache(
    async (subjectId: SubjectId | Principal | undefined) =>
      createAbility(await cachedGetResolvedSubject(subjectId)),
  );

  const getResolvedSubject = (subjectId?: SubjectId | Principal) =>
    cachedGetResolvedSubject(subjectId);

  const getAbility = (subjectId?: SubjectId | Principal) =>
    cachedGetAbility(subjectId);

  const Provider = async ({ children }: { children?: ReactNode }) => {
    const subject = await getResolvedSubject();
    return <AbilityProvider subject={subject}>{children}</AbilityProvider>;
  };

  const Ability = async (props: AbilityProps) => {
    const ability = await getAbility();
    return abilityAllows(ability, props)
      ? props.children
      : (props.fallback ?? null);
  };

  return { service, getResolvedSubject, getAbility, Provider, Ability };
}

function createForwardingFetch(forwardHeaders: string[]): FetchLike {
  return async (input, init) => {
    const headers = new Headers(init?.headers);

    if (forwardHeaders.length > 0) {
      try {
        const incoming = await nextHeaders();
        for (const name of forwardHeaders) {
          if (!headers.has(name)) {
            const value = incoming.get(name);
            if (value !== null) {
              headers.set(name, value);
            }
          }
        }
      } catch {
        // Not inside a Next request scope; nothing to forward.
      }
    }

    return fetch(input, { ...init, headers });
  };
}

export function createNextVPerms(config: NextVPermsConfig): NextVPerms {
  const { backend, cache = reactCache, browserFetchOptions } = config;
  const prefix = normalizePrefix(config.prefix ?? "/vperms");

  if (backend.kind === "next") {
    const local = createLocalServer(backend, cache);

    return {
      backend,
      prefix,
      clientTransport: "proxy",
      browserConfig: { origin: "", prefix, fetchOptions: browserFetchOptions },
      getResolvedSubject: local.getResolvedSubject,
      getAbility: local.getAbility,
      Provider: local.Provider,
      Ability: local.Ability,
      handlers: createLocalHandlers(backend, prefix, {
        service: local.service,
      }),
    };
  }

  const clientTransport = config.client ?? "proxy";
  const subjectResolver = backend.subjectResolver;
  const server = createReactServerVPerms(backend.origin, {
    prefix: backend.prefix,
    subjectResolver:
      subjectResolver === undefined
        ? undefined
        : () => subjectResolver() ?? null,
    fetch: backend.fetch ?? createForwardingFetch(backend.forwardHeaders),
    fetchOptions: backend.fetchOptions,
    cache,
  });

  const browserConfig: BrowserConfig =
    clientTransport === "direct"
      ? {
          origin: backend.origin,
          prefix: backend.prefix,
          fetchOptions: browserFetchOptions,
        }
      : { origin: "", prefix, fetchOptions: browserFetchOptions };

  return {
    backend,
    prefix,
    clientTransport,
    browserConfig,
    client: server.client,
    getResolvedSubject: server.getResolvedSubject,
    getAbility: server.getAbility,
    Provider: server.Provider,
    Ability: server.Ability,
    handlers: createExternalHandlers(backend, prefix),
  };
}
