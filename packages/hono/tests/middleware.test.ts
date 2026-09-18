import { describe, expect, test } from "bun:test";
import { SubjectType } from "vperms";
import { appWith, StubPrincipal, seed, WS } from "./helpers";

describe("vpermsMiddleware", () => {
  test("resolves a raw subject id and hydrates the context", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");
    app.get("/me", async (c) => {
      return c.json({
        id: c.var.subject?.id,
        kind: c.var.kind,
        read: await c.var.ability.can("posts.read"),
      });
    });

    const response = await app.request("/me");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "alice",
      kind: SubjectType.User,
      read: true,
    });
  });

  test("resolves a Principal", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => new StubPrincipal("alice"));
    app.get("/me", (c) => c.json({ id: c.var.subject?.id }));

    expect(await (await app.request("/me")).json()).toEqual({ id: "alice" });
  });

  test("resolves an async resolver", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, async () => "bob");
    app.get("/me", (c) => c.json({ id: c.var.subject?.id }));

    expect(await (await app.request("/me")).json()).toEqual({ id: "bob" });
  });

  test("falls back to the anonymous subject", async () => {
    const { adapter, service } = await seed();
    await service.saveSubject(WS, {
      id: "everyone",
      type: SubjectType.Group,
      parents: [],
    });
    await service.setPermission(WS, "everyone", "public.read", true);

    const app = appWith(adapter, () => null, {
      defaultParents: { byType: { [SubjectType.Anon]: ["everyone"] } },
    });
    app.get("/me", async (c) => {
      return c.json({
        id: c.var.subject?.id,
        kind: c.var.kind,
        read: await c.var.ability.can("public.read"),
      });
    });

    expect(await (await app.request("/me")).json()).toEqual({
      id: "anonymous",
      kind: SubjectType.Anon,
      read: true,
    });
  });

  test("leaves subject and kind undefined when no record exists", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "ghost");
    app.get("/me", async (c) => {
      return c.json({
        subject: c.var.subject,
        kind: c.var.kind,
        read: await c.var.ability.can("posts.read"),
      });
    });

    const body = (await (await app.request("/me")).json()) as {
      subject: unknown;
      kind: unknown;
      read: boolean;
    };
    expect(body.subject).toBeUndefined();
    expect(body.kind).toBeUndefined();
    expect(body.read).toBe(false);
  });

  test("does not leak state between requests", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, (c) => c.req.header("x-subject") ?? null);
    app.get("/me", (c) => c.json({ id: c.var.subject?.id }));

    const first = await app.request("/me", {
      headers: { "x-subject": "alice" },
    });
    const second = await app.request("/me", {
      headers: { "x-subject": "bob" },
    });
    const anonymous = await app.request("/me");

    expect(await first.json()).toEqual({ id: "alice" });
    expect(await second.json()).toEqual({ id: "bob" });
    expect(await anonymous.json()).toEqual({ id: "anonymous" });
  });
});
