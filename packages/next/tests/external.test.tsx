import { describe, expect, test } from "bun:test";
import {
  createNextVPerms,
  externalBackend,
  nextBackend,
} from "@vperms/next/server";
import { VPermsHttpError } from "@vperms/react/server";
import { ALICE, jsonResponse, seed, startServer, WS } from "./helpers";

const CHECKS = ["posts.read", "posts.update", "account.active", "admin.user"];

describe("ExternalBackend server resolution", () => {
  test("loads the current subject through the external API", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url, prefix: "/vperms" }),
    });

    const dto = await vperms.getResolvedSubject();
    expect(dto).toEqual(ALICE);
    expect(server.requests).toContain("/vperms/subject/me");

    server.close();
  });

  test("loads an explicit resolved subject id", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({
      backend: externalBackend({
        origin: server.url,
        subjectResolver: () => "bob",
      }),
    });

    await vperms.getResolvedSubject();
    expect(server.requests).toContain("/vperms/subject/bob");

    server.close();
  });

  test("surfaces upstream HTTP errors", async () => {
    const server = startServer(() => new Response("nope", { status: 500 }));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url }),
    });

    await expect(vperms.getResolvedSubject()).rejects.toBeInstanceOf(
      VPermsHttpError,
    );

    server.close();
  });

  test("rejects payloads that fail ResolvedSubject validation", async () => {
    const server = startServer(() => jsonResponse({ nope: true }));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url }),
    });

    await expect(vperms.getResolvedSubject()).rejects.toThrow();

    server.close();
  });
});

describe("client transport selection", () => {
  test("direct transport targets the external backend", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url, prefix: "/api" }),
      client: "direct",
    });

    expect(vperms.clientTransport).toBe("direct");
    expect(vperms.browserConfig.origin).toBe(server.url);
    expect(vperms.browserConfig.prefix).toBe("/api");

    server.close();
  });

  test("proxy transport targets the Next application", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url, prefix: "/vperms" }),
    });

    expect(vperms.clientTransport).toBe("proxy");
    expect(vperms.browserConfig.origin).toBe("");
    expect(vperms.browserConfig.prefix).toBe("/vperms");

    server.close();
  });
});

describe("proxy handlers", () => {
  test("forwards the browser request and returns the upstream response", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url, prefix: "/vperms" }),
    });

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/subject/me", {
        headers: { cookie: "sid=1", authorization: "Bearer token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ALICE);
    expect(server.requests).toContain("/vperms/subject/me");
    const forwarded = server.headers.at(-1);
    expect(forwarded?.get("cookie")).toBe("sid=1");
    expect(forwarded?.get("authorization")).toBe("Bearer token");

    server.close();
  });

  test("accepts catch-all params as the authoritative path", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({
      backend: externalBackend({ origin: server.url, prefix: "/vperms" }),
    });

    const response = await vperms.handlers.GET(
      new Request("http://localhost/ignored"),
      { params: Promise.resolve({ path: ["subject", "alice"] }) },
    );

    expect(response.status).toBe(200);
    expect(server.requests).toContain("/vperms/subject/alice");

    server.close();
  });
});

describe("local and external backends are equivalent", () => {
  test("produce the same authorization decisions", async () => {
    const { adapter } = await seed();
    const server = startServer(() => jsonResponse(ALICE));

    const local = createNextVPerms({
      backend: nextBackend({
        adapter,
        workspace: WS,
        subjectResolver: () => "alice",
      }),
    });
    const external = createNextVPerms({
      backend: externalBackend({ origin: server.url }),
    });

    const localAbility = await local.getAbility();
    const externalAbility = await external.getAbility();

    for (const permission of CHECKS) {
      expect(localAbility.can(permission)).toBe(
        externalAbility.can(permission),
      );
    }

    server.close();
  });
});
