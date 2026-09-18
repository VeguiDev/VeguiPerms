import type { FetchLike } from "@vperms/client";
import type { DefaultParents, VeguiPermsAdapter } from "vperms";
import {
  normalizeOrigin,
  normalizePrefix,
  type SubjectResolver,
} from "../shared";

export interface NextBackendOptions {
  adapter: VeguiPermsAdapter;
  /** Workspace the local adapter is scoped to. */
  workspace: string;
  subjectResolver: SubjectResolver;
  defaultParents?: DefaultParents;
}

/**
 * Resolves permissions directly inside the Next application through the
 * adapter and core service. Server Components never perform HTTP requests.
 */
export interface NextBackend extends NextBackendOptions {
  kind: "next";
}

export function nextBackend(options: NextBackendOptions): NextBackend {
  return { kind: "next", ...options };
}

export interface ExternalBackendOptions {
  /** Absolute origin of the external VeguiPerms server. */
  origin: string;
  /** Path prefix of the external API. Defaults to `/vperms`. */
  prefix?: string;
  /** Optional subject resolver used for server-side resolution. */
  subjectResolver?: SubjectResolver;
  /** Custom fetch used for server-side resolution and proxying. */
  fetch?: FetchLike;
  /** Options merged into server-side requests (for example credentials). */
  fetchOptions?: RequestInit;
  /**
   * Incoming header names forwarded to the external backend during
   * server-side resolution. Defaults to `cookie` and `authorization`.
   */
  forwardHeaders?: string[];
}

/**
 * Delegates authorization to an external VeguiPerms server. The browser either
 * calls that server directly (`direct`) or goes through Next (`proxy`).
 */
export interface ExternalBackend {
  kind: "external";
  origin: string;
  prefix: string;
  subjectResolver?: SubjectResolver;
  fetch?: FetchLike;
  fetchOptions?: RequestInit;
  forwardHeaders: string[];
}

export function externalBackend(
  options: ExternalBackendOptions,
): ExternalBackend {
  return {
    kind: "external",
    origin: normalizeOrigin(options.origin),
    prefix: normalizePrefix(options.prefix ?? "/vperms"),
    subjectResolver: options.subjectResolver,
    fetch: options.fetch,
    fetchOptions: options.fetchOptions,
    forwardHeaders: options.forwardHeaders ?? ["cookie", "authorization"],
  };
}

export type Backend = NextBackend | ExternalBackend;
