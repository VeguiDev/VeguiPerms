import { describe, expect, test } from "bun:test";
import { vpermsMiddleware } from "@vperms/express";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";
import { withApp } from "./helpers";

const WS = "workspace";
const ALICE = "alice";
const BOB = "bob";

interface ResolvedDto {
  id: string;
  type: string;
  parents: string[];
  permissions: { permission: string; value: boolean; weight: number }[];
}

async function seed() {
  const adapter = new VeguiPermsMemoryAdapter();
  const service = new VeguiPermsService({ adapter });
  await service.saveSubject(WS, {
    id: ALICE,
    type: SubjectType.User,
    parents: ["staff"],
  });
  await service.saveSubject(WS, {
    id: BOB,
    type: SubjectType.User,
    parents: [],
  });
  await service.saveSubject(WS, {
    id: "staff",
    type: SubjectType.Group,
    parents: [],
  });
  await service.setPermission(WS, ALICE, "workspaces.1.read", true);
  await service.setPermission(WS, BOB, "posts.read", true);
  await service.setPermission(WS, "staff", "team.read", true);
  return { adapter, service };
}

function exportApp(
  adapter: VeguiPermsMemoryAdapter,
  resolver: (req: Request) => string | null,
): express.Express {
  const app = express();
  app.use(
    vpermsMiddleware({
      adapter,
      workspace: WS,
      resolver,
      permissionsExport: { path: "/subject/:subjectId" },
    }),
  );
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: error.message });
  });
  return app;
}

describe("permissions export", () => {
  test("exports the current subject's permissions", async () => {
    const { adapter } = await seed();
    const app = exportApp(adapter, () => ALICE);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);

      const dto = (await response.json()) as ResolvedDto;
      expect(dto.id).toBe(ALICE);
      expect(dto.type).toBe(SubjectType.User);
      expect(dto.parents).toEqual(["staff"]);

      const read = dto.permissions.find(
        (entry) => entry.permission === "workspaces.1.read",
      );
      expect(read).toEqual({
        permission: "workspaces.1.read",
        value: true,
        weight: expect.any(Number),
      });

      const inherited = dto.permissions.find(
        (entry) => entry.permission === "team.read",
      );
      expect(inherited?.value).toBe(true);

      const self = dto.permissions.find(
        (entry) => entry.permission === "vperms.subject.me.permissions",
      );
      expect(self?.value).toBe(true);
    });
  });

  test("treats the literal 'me' as the current subject", async () => {
    const { adapter } = await seed();
    const app = exportApp(adapter, () => ALICE);

    await withApp(app, async (url) => {
      const dto = (await (
        await fetch(`${url}/subject/me`)
      ).json()) as ResolvedDto;
      expect(dto.id).toBe(ALICE);
    });
  });

  test("denies exporting another subject without a grant", async () => {
    const { adapter } = await seed();
    const app = exportApp(adapter, () => BOB);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(403);
    });
  });

  test("allows exporting another subject with an explicit grant", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(
      WS,
      BOB,
      `vperms.subject.${ALICE}.permissions`,
      true,
    );
    const app = exportApp(adapter, () => BOB);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as ResolvedDto).id).toBe(ALICE);
    });
  });

  test("allows exporting another subject with a wildcard grant", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(WS, BOB, "vperms.subject.*.permissions", true);
    const app = exportApp(adapter, () => BOB);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);
    });
  });

  test("an explicit deny overrides the built-in self permission", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(
      WS,
      BOB,
      "vperms.subject.me.permissions",
      false,
    );
    const app = exportApp(adapter, () => BOB);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/me`);
      expect(response.status).toBe(403);
    });
  });

  test("returns 404 when the target subject does not exist", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(
      WS,
      ALICE,
      "vperms.subject.ghost.permissions",
      true,
    );
    const app = exportApp(adapter, () => ALICE);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/ghost`);
      expect(response.status).toBe(404);
    });
  });

  test("is disabled by default", async () => {
    const { adapter } = await seed();
    const app = express();
    app.use(
      vpermsMiddleware({ adapter, workspace: WS, resolver: () => ALICE }),
    );
    app.get("/subject/:subjectId", (req, res) => {
      res.json({ handler: true, subjectId: req.params.subjectId });
    });

    await withApp(app, async (url) => {
      const body = await (await fetch(`${url}/subject/${ALICE}`)).json();
      expect(body).toEqual({ handler: true, subjectId: ALICE });
    });
  });

  test("rejects a malformed export path configuration", async () => {
    const { adapter } = await seed();
    expect(() =>
      vpermsMiddleware({
        adapter,
        workspace: WS,
        resolver: () => ALICE,
        permissionsExport: { path: "/subject" },
      }),
    ).toThrow(/parameter segment/);
  });
});
