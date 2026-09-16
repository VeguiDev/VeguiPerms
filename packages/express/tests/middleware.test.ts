import { describe, expect, test } from "bun:test";
import {
  ANONYMOUS_SUBJECT_ID,
  type VpermsMiddlewareOptions,
  vpermsMiddleware,
} from "@vperms/express";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import type { Principal, Subject } from "vperms";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";
import { withApp } from "./helpers";

const WS = "workspace";
const USER = "user-1";

class UserPrincipal implements Principal {
  constructor(private readonly id: string) {}

  getSubjectId(): string {
    return this.id;
  }
}

async function seed() {
  const adapter = new VeguiPermsMemoryAdapter();
  const service = new VeguiPermsService({ adapter });
  await service.saveSubject(WS, {
    id: USER,
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, USER, "posts.read", true);
  return { adapter, service };
}

function abilityApp(options: VpermsMiddlewareOptions) {
  const app = express();
  app.use(vpermsMiddleware(options));
  app.get("/ability", async (req, res) => {
    res.json({
      hasAbility: typeof req.ability?.can === "function",
      read: await req.ability.can("posts.read"),
      write: await req.ability.can("posts.write"),
    });
  });
  return app;
}

describe("vpermsMiddleware", () => {
  test("resolves a raw SubjectId", async () => {
    const { adapter } = await seed();
    const app = abilityApp({ adapter, workspace: WS, resolver: () => USER });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/ability`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        hasAbility: true,
        read: true,
        write: false,
      });
    });
  });

  test("resolves a Principal", async () => {
    const { adapter } = await seed();
    const app = abilityApp({
      adapter,
      workspace: WS,
      resolver: () => new UserPrincipal(USER),
    });

    await withApp(app, async (url) => {
      expect(await (await fetch(`${url}/ability`)).json()).toEqual({
        hasAbility: true,
        read: true,
        write: false,
      });
    });
  });

  test("supports an async principal resolver", async () => {
    const { adapter } = await seed();
    const app = abilityApp({
      adapter,
      workspace: WS,
      resolver: async () => new UserPrincipal(USER),
    });

    await withApp(app, async (url) => {
      expect(await (await fetch(`${url}/ability`)).json()).toEqual({
        hasAbility: true,
        read: true,
        write: false,
      });
    });
  });

  test("creates an anonymous subject when the resolver returns null", async () => {
    const { adapter } = await seed();
    await adapter.saveSubject(WS, {
      id: "everyone",
      type: SubjectType.Group,
      parents: [],
    });
    await adapter.grantPermission(WS, "everyone", "posts.read", true);

    const app = abilityApp({
      adapter,
      workspace: WS,
      resolver: () => null,
      defaultParents: { byType: { [SubjectType.Anon]: ["everyone"] } },
    });

    await withApp(app, async (url) => {
      expect(await (await fetch(`${url}/ability`)).json()).toEqual({
        hasAbility: true,
        read: true,
        write: false,
      });
    });

    const anonymous: Subject | null = await adapter.findSubject(
      WS,
      ANONYMOUS_SUBJECT_ID,
    );
    expect(anonymous?.type).toBe(SubjectType.Anon);
    expect(anonymous?.parents).toEqual([]);
  });

  test("reuses the anonymous subject on later requests", async () => {
    const { adapter } = await seed();
    const app = abilityApp({
      adapter,
      workspace: WS,
      resolver: () => null,
    });

    await withApp(app, async (url) => {
      await fetch(`${url}/ability`);
      await fetch(`${url}/ability`);
    });

    const anonymous = await adapter.findSubject(WS, ANONYMOUS_SUBJECT_ID);
    expect(anonymous?.type).toBe(SubjectType.Anon);
  });

  test("exposes req.ability after the middleware", async () => {
    const { adapter } = await seed();
    const app = abilityApp({ adapter, workspace: WS, resolver: () => USER });

    await withApp(app, async (url) => {
      const body = (await (await fetch(`${url}/ability`)).json()) as {
        hasAbility: boolean;
      };
      expect(body.hasAbility).toBe(true);
    });
  });

  test("allows manual req.ability.can() calls", async () => {
    const { adapter } = await seed();
    const app = abilityApp({ adapter, workspace: WS, resolver: () => USER });

    await withApp(app, async (url) => {
      expect(await (await fetch(`${url}/ability`)).json()).toEqual({
        hasAbility: true,
        read: true,
        write: false,
      });
    });
  });

  test("supports a workspace resolver", async () => {
    const { adapter } = await seed();
    const app = abilityApp({
      adapter,
      workspace: (req: Request) => req.header("x-workspace") ?? WS,
      resolver: () => USER,
    });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/ability`, {
        headers: { "x-workspace": WS },
      });
      expect(response.status).toBe(200);
    });
  });

  test("forwards resolver errors through next(error)", async () => {
    const { adapter } = await seed();
    const app = express();
    app.use(
      vpermsMiddleware({
        adapter,
        workspace: WS,
        resolver: () => {
          throw new Error("resolver boom");
        },
      }),
    );
    app.get("/", (_req, res) => {
      res.sendStatus(200);
    });
    app.use(
      (error: Error, _req: Request, res: Response, _next: NextFunction) => {
        res.status(500).json({ message: error.message });
      },
    );

    await withApp(app, async (url) => {
      const response = await fetch(url);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ message: "resolver boom" });
    });
  });

  test("keeps ability state request-scoped", async () => {
    const { adapter, service } = await seed();
    await service.saveSubject(WS, {
      id: "user-2",
      type: SubjectType.User,
      parents: [],
    });

    const app = express();
    app.use(
      vpermsMiddleware({
        adapter,
        workspace: WS,
        resolver: (req) => req.header("x-user") ?? null,
      }),
    );
    app.get("/ability", async (req, res) => {
      res.json({ read: await req.ability.can("posts.read") });
    });

    await withApp(app, async (url) => {
      const first = await fetch(`${url}/ability`, {
        headers: { "x-user": USER },
      });
      const second = await fetch(`${url}/ability`, {
        headers: { "x-user": "user-2" },
      });

      expect(await first.json()).toEqual({ read: true });
      expect(await second.json()).toEqual({ read: false });
    });
  });
});
