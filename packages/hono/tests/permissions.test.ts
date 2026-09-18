import { describe, expect, test } from "bun:test";
import {
  hasAnyPermission,
  hasPermission,
  vpermsMiddleware,
} from "@vperms/hono";
import { Hono } from "hono";
import { SubjectType } from "vperms";
import { appWith, seed, WS } from "./helpers";

describe("hasPermission", () => {
  test("allows a single fixed permission", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");
    app.get("/posts", hasPermission("posts.read"), (c) => c.json({ ok: true }));

    expect((await app.request("/posts")).status).toBe(200);
  });

  test("returns 403 when a permission is denied", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "bob");
    app.get("/posts", hasPermission("posts.read"), (c) => c.json({ ok: true }));

    expect((await app.request("/posts")).status).toBe(403);
  });

  test("evaluates sync and async permission builders", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");
    app.get(
      "/posts/:action",
      hasPermission((c) => `posts.${c.req.param("action")}`),
      (c) => c.json({ ok: true }),
    );
    app.get(
      "/async/:action",
      hasPermission(async (c) => `posts.${c.req.param("action")}`),
      (c) => c.json({ ok: true }),
    );

    expect((await app.request("/posts/read")).status).toBe(200);
    expect((await app.request("/posts/delete")).status).toBe(403);
    expect((await app.request("/async/read")).status).toBe(200);
    expect((await app.request("/async/delete")).status).toBe(403);
  });

  test("requires every permission to pass", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");
    app.get(
      "/posts/:action",
      hasPermission("posts.read", (c) => `posts.${c.req.param("action")}`),
      (c) => c.json({ ok: true }),
    );

    expect((await app.request("/posts/read")).status).toBe(200);
    expect((await app.request("/posts/write")).status).toBe(200);
    expect((await app.request("/posts/delete")).status).toBe(403);
  });

  test("short-circuits on the first failing permission", async () => {
    const { adapter } = await seed();
    let evaluated = false;
    const app = appWith(adapter, () => "alice");
    app.get(
      "/posts",
      hasPermission("posts.delete", () => {
        evaluated = true;
        return "posts.read";
      }),
      (c) => c.json({ ok: true }),
    );

    expect((await app.request("/posts")).status).toBe(403);
    expect(evaluated).toBe(false);
  });

  test("fails clearly when vpermsMiddleware is not registered", async () => {
    const app = new Hono();
    app.onError((error, c) => c.json({ message: error.message }, 500));
    app.get("/posts", hasPermission("posts.read"), (c) => c.json({ ok: true }));

    const response = await app.request("/posts");
    expect(response.status).toBe(500);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("vpermsMiddleware");
  });
});

describe("hasAnyPermission", () => {
  test("allows when at least one permission passes", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");
    app.get("/posts", hasAnyPermission("posts.delete", "posts.read"), (c) =>
      c.json({ ok: true }),
    );

    expect((await app.request("/posts")).status).toBe(200);
  });

  test("returns 403 when no permission passes", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");
    app.get(
      "/posts",
      hasAnyPermission(
        "posts.delete",
        (c) => `posts.${c.req.param("id")}.owner`,
      ),
      (c) => c.json({ ok: true }),
    );

    expect((await app.request("/posts")).status).toBe(403);
  });

  test("short-circuits on the first passing permission", async () => {
    const { adapter } = await seed();
    let evaluated = false;
    const app = appWith(adapter, () => "alice");
    app.get(
      "/posts",
      hasAnyPermission("posts.read", () => {
        evaluated = true;
        return "posts.delete";
      }),
      (c) => c.json({ ok: true }),
    );

    expect((await app.request("/posts")).status).toBe(200);
    expect(evaluated).toBe(false);
  });
});

describe("workspace resolver", () => {
  test("resolves the workspace per request", async () => {
    const { adapter, service } = await seed();
    await service.saveSubject("other", {
      id: "carol",
      type: SubjectType.User,
      parents: [],
    });
    await service.setPermission("other", "carol", "posts.read", true);

    const app = new Hono();
    app.use(
      vpermsMiddleware({
        adapter,
        workspace: (c) => c.req.header("x-workspace") ?? WS,
        resolver: (c) => c.req.header("x-subject") ?? null,
      }),
    );
    app.get("/posts", hasPermission("posts.read"), (c) => c.json({ ok: true }));

    expect(
      (
        await app.request("/posts", {
          headers: { "x-subject": "carol", "x-workspace": "other" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("/posts", {
          headers: { "x-subject": "carol" },
        })
      ).status,
    ).toBe(403);
  });
});
