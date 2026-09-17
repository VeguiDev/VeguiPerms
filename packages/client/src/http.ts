import { type ResolvedSubject, ResolvedSubjectSchema } from "vperms";
import type { FetchLike } from "./types";

/** Thrown when the VeguiPerms HTTP API responds with a non-2xx status. */
export class VPermsHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`@vperms/client: request to ${url} failed with status ${status}.`);
    this.name = "VPermsHttpError";
    this.status = status;
    this.url = url;
  }
}

export interface FetchResolvedSubjectOptions {
  fetch?: FetchLike;
  requestInit?: RequestInit;
}

/**
 * Loads and validates a resolved subject from a VeguiPerms export endpoint.
 *
 * Arbitrary JSON is never trusted: the response body is validated with the
 * shared `ResolvedSubjectSchema` before it is returned.
 */
export async function fetchResolvedSubject(
  url: string,
  options: FetchResolvedSubjectOptions = {},
): Promise<ResolvedSubject> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(url, options.requestInit);

  if (!response.ok) {
    throw new VPermsHttpError(response.status, url);
  }

  const payload = await response.json();
  return ResolvedSubjectSchema.parse(payload);
}
