import { describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Controller, Get, Param } from "@nestjs/common";
import { vpermsMiddleware } from "@vperms/express";
import { VPermsModule } from "@vperms/nest";
import express from "express";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";
import { createTestApp, withApp } from "./helpers";

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

function nestApp(
  adapter: VeguiPermsMemoryAdapter,
  current: string,
  permissionsExport?: { path: string },
): Promise<INestApplication> {
  return createTestApp({
    imports: [
      VPermsModule.forRoot({
        adapter,
        resolver: () => current,
        workspace: WS,
        permissionsExport,
      }),
    ],
  });
}

function expressApp(
  adapter: VeguiPermsMemoryAdapter,
  current: string,
): express.Express {
  const app = express();
  app.use(
    vpermsMiddleware({
      adapter,
      workspace: WS,
      resolver: () => current,
      permissionsExport: { path: "/subject/:subjectId" },
    }),
  );
  return app;
}

async function withExpress<T>(
  app: express.Express,
  run: (url: string) => Promise<T>,
): Promise<T> {
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the app to listen on a TCP address");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

@Controller()
class SubjectController {
  @Get("subject/:subjectId")
  handler(@Param("subjectId") subjectId: string) {
    return { handler: true, subjectId };
  }
}

describe("permissions export", () => {
  test("exports the current subject's permissions", async () => {
    const { adapter } = await seed();
    const app = await nestApp(adapter, ALICE, { path: "/subject/:subjectId" });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);

      const dto = (await response.json()) as ResolvedDto;
      expect(dto.id).toBe(ALICE);
      expect(dto.type).toBe(SubjectType.User);
      expect(dto.parents).toEqual(["staff"]);
      expect(
        dto.permissions.find((entry) => entry.permission === "team.read")
          ?.value,
      ).toBe(true);
      expect(
        dto.permissions.find(
          (entry) => entry.permission === "vperms.subject.me.permissions",
        )?.value,
      ).toBe(true);
    });
  });

  test("includes deterministic weights in the JSON payload", async () => {
    const { adapter } = await seed();
    const app = await nestApp(adapter, ALICE, { path: "/subject/:subjectId" });

    await withApp(app, async (url) => {
      const dto = (await (
        await fetch(`${url}/subject/${ALICE}`)
      ).json()) as ResolvedDto;

      expect(dto.permissions.length).toBeGreaterThan(1);
      for (const entry of dto.permissions) {
        expect(typeof entry.weight).toBe("number");
      }
      const weights = dto.permissions.map((entry) => entry.weight);
      const sorted = [...weights].sort((a, b) => b - a);
      expect(weights).toEqual(sorted);
      expect(new Set(weights).size).toBe(weights.length);
    });
  });

  test("treats the literal 'me' as the current subject", async () => {
    const { adapter } = await seed();
    const app = await nestApp(adapter, ALICE, { path: "/subject/:subjectId" });

    await withApp(app, async (url) => {
      const dto = (await (
        await fetch(`${url}/subject/me`)
      ).json()) as ResolvedDto;
      expect(dto.id).toBe(ALICE);
    });
  });

  test("denies exporting another subject without a grant", async () => {
    const { adapter } = await seed();
    const app = await nestApp(adapter, BOB, { path: "/subject/:subjectId" });

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
    const app = await nestApp(adapter, BOB, { path: "/subject/:subjectId" });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);
      expect(((await response.json()) as ResolvedDto).id).toBe(ALICE);
    });
  });

  test("allows exporting another subject with a wildcard grant", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(WS, BOB, "vperms.subject.*.permissions", true);
    const app = await nestApp(adapter, BOB, { path: "/subject/:subjectId" });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);
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
    const app = await nestApp(adapter, ALICE, { path: "/subject/:subjectId" });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/ghost`);
      expect(response.status).toBe(404);
    });
  });

  test("returns the same DTO as the Express integration", async () => {
    const { adapter } = await seed();
    const nest = await nestApp(adapter, ALICE, { path: "/subject/:subjectId" });
    const expressServer = expressApp(adapter, ALICE);

    const nestDto = await withApp(
      nest,
      async (url) =>
        (await (await fetch(`${url}/subject/${ALICE}`)).json()) as ResolvedDto,
    );
    const expressDto = await withExpress(
      expressServer,
      async (url) =>
        (await (await fetch(`${url}/subject/${ALICE}`)).json()) as ResolvedDto,
    );

    expect(nestDto).toEqual(expressDto);
  });

  test("is disabled by default", async () => {
    const { adapter } = await seed();
    const app = await createTestApp({
      imports: [
        VPermsModule.forRoot({
          adapter,
          resolver: () => ALICE,
          workspace: WS,
        }),
      ],
      controllers: [SubjectController],
    });

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/subject/${ALICE}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        handler: true,
        subjectId: ALICE,
      });
    });
  });
});
