import { type ResolvedSubject, SubjectType } from "@vperms/client";
import type { CacheWrapper } from "@vperms/react/server";
import {
  type Principal,
  type Subject,
  type SubjectId,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

export const WS = "workspace";

export function buildSubject(
  overrides: Partial<ResolvedSubject> = {},
): ResolvedSubject {
  return {
    id: "alice",
    type: SubjectType.User,
    parents: [],
    permissions: [
      { permission: "posts.read", value: true, weight: 100 },
      { permission: "posts.update", value: true, weight: 90 },
      { permission: "admin.*", value: false, weight: 80 },
    ],
    ...overrides,
  };
}

export const ALICE = buildSubject();
export const BOB = buildSubject({
  id: "bob",
  permissions: [{ permission: "account.active", value: true, weight: 100 }],
});

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface RunningServer {
  url: string;
  requests: string[];
  headers: Headers[];
  close: () => void;
}

export function startServer(
  handler: (request: Request) => Response | Promise<Response>,
): RunningServer {
  const requests: string[] = [];
  const headers: Headers[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push(new URL(request.url).pathname);
      headers.push(request.headers);
      return handler(request);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    headers,
    close: () => {
      server.stop(true);
    },
  };
}

export interface Seed {
  adapter: VeguiPermsMemoryAdapter;
  service: VeguiPermsService;
}

export async function seed(): Promise<Seed> {
  const adapter = new VeguiPermsMemoryAdapter();
  const service = new VeguiPermsService({ adapter });

  await service.saveSubject(WS, {
    id: "alice",
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, "alice", "posts.read", true);
  await service.setPermission(WS, "alice", "posts.update", true);

  await service.saveSubject(WS, {
    id: "bob",
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, "bob", "account.active", true);

  await service.saveSubject(WS, {
    id: "auditor",
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(
    WS,
    "auditor",
    "vperms.subject.*.permissions",
    true,
  );

  return { adapter, service };
}

export class CountingAdapter extends VeguiPermsMemoryAdapter {
  finds = 0;

  override async findSubject(
    workspaceId: string,
    subjectId: SubjectId,
  ): Promise<Subject | null> {
    this.finds += 1;
    return super.findSubject(workspaceId, subjectId);
  }
}

export class StubPrincipal implements Principal {
  constructor(private readonly id: SubjectId) {}

  getSubjectId(): SubjectId {
    return this.id;
  }
}

export interface ScopeCache {
  cache: CacheWrapper;
  run: <T>(fn: () => Promise<T>) => Promise<T>;
}

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
