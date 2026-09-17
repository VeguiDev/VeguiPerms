import type { Principal, SubjectId } from "vperms";

/**
 * The subset of the Fetch API the client relies on. It mirrors `globalThis.fetch`
 * so a custom implementation can be supplied for SSR, cookie forwarding,
 * testing or non-standard runtimes.
 */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Determines the subject for the current execution/request. Returning `null`
 * (or omitting the resolver) means the anonymous subject, which the server
 * resolves through its `/subject/me` endpoint.
 */
export type SubjectResolver = () =>
  | SubjectId
  | Principal
  | null
  | Promise<SubjectId | Principal | null>;

export interface VPermsConfig {
  /** Where the VeguiPerms HTTP API is mounted relative to `origin`. */
  prefix?: string;
  /** Resolves the current subject identity. */
  subjectResolver?: SubjectResolver;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Options forwarded to every fetch call, e.g. `{ credentials: "include" }`. */
  fetchOptions?: RequestInit;
}

export const DEFAULT_PREFIX = "/vperms";

export function resolveSubjectId(subject: SubjectId | Principal): SubjectId {
  return typeof subject === "string" ? subject : subject.getSubjectId();
}
