import type { FetchLike } from "@vperms/client";
import { type ResolvedSubject, SubjectType } from "vperms";

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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

export interface RecordingFetch {
  calls: RecordedCall[];
  fetch: FetchLike;
}

export function recordingFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): RecordingFetch {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, fetch };
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
