import type { Principal, SubjectId } from "@vperms/client";

export type SubjectResolverResult = SubjectId | Principal | null;

/**
 * Resolves the subject for the current execution.
 *
 * Server Components call it without arguments; Route Handlers pass the
 * incoming request so the resolver can inspect headers or cookies.
 */
export type SubjectResolver = (
  request?: Request,
) => SubjectResolverResult | Promise<SubjectResolverResult>;

/**
 * The serializable configuration a browser Client Component needs to build its
 * own `@vperms/react` client. It never contains adapter, tokens or server code.
 */
export interface BrowserConfig {
  origin: string;
  prefix: string;
  fetchOptions?: RequestInit;
}

/**
 * How the browser reaches the resolved-subject API.
 *
 * `direct` talks to the external backend itself, `proxy` talks to the Next
 * application and lets it forward the request with server credentials.
 */
export type ClientTransport = "direct" | "proxy";

export function normalizePrefix(prefix: string): string {
  if (prefix.length === 0 || prefix === "/") {
    return "";
  }

  const withLeading = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeading.replace(/\/+$/, "");
}

export function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function joinUrl(origin: string, path: string): string {
  return `${normalizeOrigin(origin)}${path}`;
}

export function stripPrefix(pathname: string, prefix: string): string[] {
  const parts = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
  const prefixParts = prefix.split("/").filter((segment) => segment.length > 0);

  if (prefixParts.length === 0 || parts.length < prefixParts.length) {
    return parts;
  }

  const matches = prefixParts.every(
    (segment, index) => parts[index] === segment,
  );

  return matches ? parts.slice(prefixParts.length) : parts;
}
