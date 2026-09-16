import { describe, expect, test } from "bun:test";
import {
  hasAnyPermission,
  hasPermission,
  vpermsMiddleware,
} from "@vperms/express";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";
import { withApp } from "./helpers";

const WS = "workspace";
const USER = "user-1";

async function seed() {
  const adapter = new VeguiPermsMemoryAdapter();
  const service = new VeguiPermsService({ adapter });
  await service.saveSubject(WS, {
    id: USER,
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, USER, "posts.read", true);
  return { adapter };
}

function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  res.status(500).json({ message: error.message });
}

function appWithAuth(adapter: VeguiPermsMemoryAdapter) {
  const app = express();
  app.use(vpermsMiddleware({ adapter, workspace: WS, resolver: () => USER }));
  return app;
}

describe("hasPermission", () => {
  test("allows a single fixed permission", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.get("/posts", hasPermission("posts.read"), (_req, res) => {
      res.json({ ok: true });
    });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/posts`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  });

  test("returns 403 when a fixed permission is denied", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.get("/posts", hasPermission("posts.write"), (_req, res) => {
      res.json({ ok: true });
    });

    await withApp(app, async (url) => {
      expect((await fetch(`${url}/posts`)).status).toBe(403);
    });
  });

  test("evaluates a dynamic permission builder", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.get(
      "/posts/:action",
      hasPermission((req) => `posts.${req.params.action}`),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      expect((await fetch(`${url}/posts/read`)).status).toBe(200);
      expect((await fetch(`${url}/posts/write`)).status).toBe(403);
    });
  });

  test("evaluates an async permission builder", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.get(
      "/posts/:action",
      hasPermission(async (req) => `posts.${req.params.action}`),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      expect((await fetch(`${url}/posts/read`)).status).toBe(200);
      expect((await fetch(`${url}/posts/write`)).status).toBe(403);
    });
  });

  test("requires every permission to pass", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.get(
      "/posts/:action",
      hasPermission("posts.read", (req) => `posts.${req.params.action}`),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      expect((await fetch(`${url}/posts/read`)).status).toBe(200);
      expect((await fetch(`${url}/posts/write`)).status).toBe(403);
    });
  });

  test("short-circuits on the first failing permission", async () => {
    const { adapter } = await seed();
    let evaluated = false;
    const app = appWithAuth(adapter);
    app.get(
      "/posts",
      hasPermission("posts.write", () => {
        evaluated = true;
        return "posts.read";
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      expect((await fetch(`${url}/posts`)).status).toBe(403);
    });
    expect(evaluated).toBe(false);
  });

  test("forwards permission builder errors through next(error)", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.get(
      "/posts",
      hasPermission(() => {
        throw new Error("builder boom");
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.use(errorHandler);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/posts`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ message: "builder boom" });
    });
  });
});

describe("hasAnyPermission", () => {
  test("allows when at least one permission passes", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.delete(
      "/posts/:id",
      hasAnyPermission("posts.write", "posts.read"),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/posts/1`, { method: "DELETE" });
      expect(response.status).toBe(200);
    });
  });

  test("returns 403 when no permission passes", async () => {
    const { adapter } = await seed();
    const app = appWithAuth(adapter);
    app.delete(
      "/posts/:id",
      hasAnyPermission("posts.write", (req) => `posts.${req.params.id}.owner`),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/posts/1`, { method: "DELETE" });
      expect(response.status).toBe(403);
    });
  });

  test("short-circuits on the first passing permission", async () => {
    const { adapter } = await seed();
    let evaluated = false;
    const app = appWithAuth(adapter);
    app.delete(
      "/posts",
      hasAnyPermission("posts.read", () => {
        evaluated = true;
        return "posts.write";
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/posts`, { method: "DELETE" });
      expect(response.status).toBe(200);
    });
    expect(evaluated).toBe(false);
  });
});

describe("missing req.ability", () => {
  test("fails clearly when vpermsMiddleware is not registered", async () => {
    const app = express();
    app.get("/posts", hasPermission("posts.read"), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/posts`);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { message: string };
      expect(body.message).toContain("vpermsMiddleware");
    });
  });
});
