import type { Principal, ResolvedSubject, SubjectId } from "vperms";
import { createAbility, type PermissionAbility } from "./ability";
import { fetchResolvedSubject } from "./http";
import { DEFAULT_PREFIX, resolveSubjectId, type VPermsConfig } from "./types";

/**
 * A configured VeguiPerms client.
 *
 * It only knows how to load resolved subjects and evaluate them. Access
 * control is enforced by the server; the client never reproduces those rules.
 */
export interface VPermsClient {
  readonly origin: string;
  readonly prefix: string;

  getResolvedSubject(
    subjectId?: SubjectId | Principal,
  ): Promise<ResolvedSubject>;
  getAbility(subjectId?: SubjectId | Principal): Promise<PermissionAbility>;
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function normalizePrefix(prefix: string): string {
  if (prefix === "" || prefix === "/") {
    return "";
  }

  const withLeading = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeading.replace(/\/+$/, "");
}

class VPermsClientImpl implements VPermsClient {
  readonly origin: string;
  readonly prefix: string;

  private readonly base: string;
  private readonly config: VPermsConfig;

  constructor(origin: string, config: VPermsConfig) {
    this.origin = normalizeOrigin(origin);
    this.prefix = normalizePrefix(config.prefix ?? DEFAULT_PREFIX);
    this.base = `${this.origin}${this.prefix}`;
    this.config = config;
  }

  async getResolvedSubject(
    subjectId?: SubjectId | Principal,
  ): Promise<ResolvedSubject> {
    if (subjectId !== undefined) {
      return this.load(
        `/subject/${encodeURIComponent(resolveSubjectId(subjectId))}`,
      );
    }

    const resolver = this.config.subjectResolver;
    const identity = resolver ? await resolver() : null;

    if (identity === null || identity === undefined) {
      return this.load("/subject/me");
    }

    return this.load(
      `/subject/${encodeURIComponent(resolveSubjectId(identity))}`,
    );
  }

  async getAbility(
    subjectId?: SubjectId | Principal,
  ): Promise<PermissionAbility> {
    return createAbility(await this.getResolvedSubject(subjectId));
  }

  private load(path: string): Promise<ResolvedSubject> {
    return fetchResolvedSubject(`${this.base}${path}`, {
      fetch: this.config.fetch,
      requestInit: this.config.fetchOptions,
    });
  }
}

/**
 * Creates a VeguiPerms client for the HTTP API at `origin`.
 *
 * `origin` may be absolute (`https://api.example.com`) or relative (`/api`,
 * or an empty string for the current origin). The resolved subject for the
 * current subject is loaded from `{origin}{prefix}/subject/me`, and from
 * `{origin}{prefix}/subject/:subjectId` for an explicit subject.
 */
export function createVPerms(
  origin: string,
  config: VPermsConfig = {},
): VPermsClient {
  return new VPermsClientImpl(origin, config);
}
