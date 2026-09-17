import { type ResolvedSubject, SubjectType } from "@vperms/client";
import type { CacheWrapper } from "@vperms/react/server";

export function buildSubject(
  overrides: Partial<ResolvedSubject> = {},
): ResolvedSubject {
  return {
    id: "alice",
    type: SubjectType.User,
    parents: ["staff"],
    permissions: [
      { permission: "workspaces.1.read", value: true, weight: 100 },
      { permission: "workspaces.*.read", value: false, weight: 90 },
      { permission: "account.active", value: true, weight: 80 },
      { permission: "admin.*", value: false, weight: 70 },
      { permission: "reports.*", value: true, weight: 60 },
    ],
    ...overrides,
  };
}

export const ALICE = buildSubject();

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface RunningServer {
  url: string;
  requests: string[];
  close: () => void;
}

export function startServer(
  handler: (request: Request) => Response | Promise<Response>,
): RunningServer {
  const requests: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push(new URL(request.url).pathname);
      return handler(request);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    close: () => {
      server.stop(true);
    },
  };
}

export interface ScopeCache {
  cache: CacheWrapper;
  run: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * A request/render-scoped cache for tests: entries are shared while a `run`
 * scope is active and discarded afterwards, mimicking React's `cache`.
 */
export function createScopeCache(): ScopeCache {
  type FunctionCache = Map<string, unknown>;
  let current = new WeakMap<object, FunctionCache>();

  const cache: CacheWrapper = (fn) => {
    return (...args) => {
      let functionCache = current.get(fn);

      if (functionCache === undefined) {
        functionCache = new Map();
        current.set(fn, functionCache);
      }

      const key = JSON.stringify(args);

      if (functionCache.has(key)) {
        return functionCache.get(key) as ReturnType<typeof fn>;
      }

      const result = fn(...args);
      functionCache.set(key, result);
      return result;
    };
  };

  return {
    cache,
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      const previous = current;
      current = new WeakMap();
      try {
        return await fn();
      } finally {
        current = previous;
      }
    },
  };
}
