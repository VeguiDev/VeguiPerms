import { describe, expect, test } from "bun:test";
import type { ExecutionContext, INestApplication } from "@nestjs/common";
import { Controller, Get, Injectable, UseGuards } from "@nestjs/common";
import {
  AbilityGuard,
  Ability as AbilityParam,
  AnyPermission,
  Kind as KindParam,
  Permission,
  Subject as SubjectParam,
  VPermsModule,
} from "@vperms/nest";
import type { Request } from "express";
import {
  type Ability,
  type SubjectType as SubjectKind,
  type Subject as SubjectModel,
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";
import { createTestApp, withApp } from "./helpers";

const WS = "workspace";
const ALICE = "alice";
const BOB = "bob";
const ANONYMOUS = "anonymous";

function subjectResolver(req: Request): string | null {
  const header = req.headers["x-subject"];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.length > 0 ? value : null;
}

@Controller()
class HydrationController {
  @Get("whoami")
  whoami(
    @SubjectParam() subject: SubjectModel | undefined,
    @KindParam() kind: SubjectKind | undefined,
    @AbilityParam() ability: Ability,
  ) {
    return {
      subject: subject?.id ?? null,
      kind: kind ?? null,
      can: typeof ability.can,
    };
  }
}

@Controller()
class OpenController {
  @Get("open")
  open() {
    return { open: true };
  }
}

@Controller()
class PermissionController {
  @Get("account")
  @Permission("account.active")
  account() {
    return { account: true };
  }

  @Get("both")
  @Permission("gate.one", "gate.two")
  both() {
    return { both: true };
  }

  @Get("short")
  @Permission("missing.permission", () => {
    throw new Error("a short-circuited builder must not run");
  })
  short() {
    return { short: true };
  }

  @Get("workspaces/:id/read")
  @Permission(async (req) => `workspaces.${req.params.id}.read`)
  read() {
    return { read: true };
  }
}

@Controller()
class AnyPermissionController {
  @Get("any/:id")
  @AnyPermission("admin.*", (req) => `workspaces.${req.params.id}.owner`)
  any() {
    return { any: true };
  }
}

@Controller()
class CountController {
  @Get("count")
  @Permission("account.active")
  count(
    @SubjectParam() subject: SubjectModel | undefined,
    @KindParam() kind: SubjectKind | undefined,
    @AbilityParam() ability: Ability,
  ) {
    return {
      subject: subject?.id ?? null,
      kind: kind ?? null,
      can: typeof ability.can,
    };
  }
}

@Injectable()
class WorkspaceOwnerGuard extends AbilityGuard {
  protected async check(
    ability: Ability,
    context: ExecutionContext,
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    return ability.can(`workspaces.${req.params.id}.owner`);
  }
}

@Injectable()
class SelfGuard extends AbilityGuard {
  protected async check(
    _ability: Ability,
    context: ExecutionContext,
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const subject = this.getSubject(context);
    const kind = this.getKind(context);
    const ability = this.getAbility(context);
    if (!subject || kind === undefined) {
      return false;
    }
    return (
      subject.id === req.params.id && (await ability.can("account.active"))
    );
  }
}

@Controller()
class GuardController {
  @Get("owner/:id")
  @UseGuards(WorkspaceOwnerGuard)
  owner() {
    return { owner: true };
  }

  @Get("self/:id")
  @UseGuards(SelfGuard)
  self() {
    return { self: true };
  }
}

interface Harness {
  adapter: VeguiPermsMemoryAdapter;
  service: VeguiPermsService;
  app: INestApplication;
}

async function harness(options?: {
  resolver?: (req: Request) => string | null;
  permissionsExport?: { path: string };
}): Promise<Harness> {
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

  const app = await createTestApp({
    imports: [
      VPermsModule.forRoot({
        adapter,
        resolver: options?.resolver ?? subjectResolver,
        workspace: WS,
        permissionsExport: options?.permissionsExport,
      }),
    ],
    controllers: [
      HydrationController,
      OpenController,
      PermissionController,
      AnyPermissionController,
      CountController,
      GuardController,
    ],
    providers: [WorkspaceOwnerGuard, SelfGuard],
  });

  return { adapter, service, app };
}

describe("VPermsModule.forRoot", () => {
  test("hydrates req.ability, req.subject and req.kind", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/whoami`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        subject: ALICE,
        kind: SubjectType.User,
        can: "function",
      });
    });
  });

  test("hydrates the anonymous subject when the resolver returns null", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/whoami`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        subject: ANONYMOUS,
        kind: SubjectType.Anon,
        can: "function",
      });
    });
  });

  test("leaves req.subject undefined when the record is missing", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/whoami`, {
        headers: { "x-subject": "ghost" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        subject: null,
        kind: null,
        can: "function",
      });
    });
  });

  test("does not deny routes without any VeguiPerms decorator", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const anonymous = await fetch(`${url}/open`);
      expect(anonymous.status).toBe(200);
      expect(await anonymous.json()).toEqual({ open: true });

      const known = await fetch(`${url}/open`, {
        headers: { "x-subject": ALICE },
      });
      expect(known.status).toBe(200);
      expect(await known.json()).toEqual({ open: true });
    });
  });
});

describe("@Permission", () => {
  test("requires every listed permission", async () => {
    const { app, service } = await harness();

    await withApp(app, async (url) => {
      const denied = await fetch(`${url}/account`, {
        headers: { "x-subject": ALICE },
      });
      expect(denied.status).toBe(403);

      await service.setPermission(WS, ALICE, "account.active", true);
      const allowed = await fetch(`${url}/account`, {
        headers: { "x-subject": ALICE },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ account: true });
    });
  });

  test("denies when only some of the permissions are granted", async () => {
    const { app, service } = await harness();
    await service.setPermission(WS, ALICE, "gate.one", true);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/both`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(403);
    });
  });

  test("supports async permission builders", async () => {
    const { app, service } = await harness();
    await service.setPermission(WS, ALICE, "workspaces.1.read", true);

    await withApp(app, async (url) => {
      const allowed = await fetch(`${url}/workspaces/1/read`, {
        headers: { "x-subject": ALICE },
      });
      expect(allowed.status).toBe(200);

      const denied = await fetch(`${url}/workspaces/2/read`, {
        headers: { "x-subject": ALICE },
      });
      expect(denied.status).toBe(403);
    });
  });

  test("uses short-circuit evaluation", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/short`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(403);
    });
  });

  test("denies access for a subject without a record", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/account`, {
        headers: { "x-subject": "ghost" },
      });
      expect(response.status).toBe(403);
    });
  });
});

describe("@AnyPermission", () => {
  test("denies when none of the permissions are granted", async () => {
    const { app } = await harness();

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/any/1`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(403);
    });
  });

  test("allows when one permission is granted through a wildcard", async () => {
    const { app, service } = await harness();
    await service.setPermission(WS, ALICE, "admin.*", true);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/any/1`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ any: true });
    });
  });

  test("allows when one permission is granted through a builder", async () => {
    const { app, service } = await harness();
    await service.setPermission(WS, ALICE, "workspaces.7.owner", true);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/any/7`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(200);
    });
  });
});

describe("request context", () => {
  test("is resolved only once per request", async () => {
    let calls = 0;
    const { app, service } = await harness({
      resolver: (req) => {
        calls += 1;
        return subjectResolver(req);
      },
    });
    await service.setPermission(WS, ALICE, "account.active", true);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/count`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        subject: ALICE,
        kind: SubjectType.User,
        can: "function",
      });
      expect(calls).toBe(1);
    });
  });

  test("does not leak state between requests", async () => {
    const { app, service } = await harness();
    await service.setPermission(WS, ALICE, "account.active", true);

    await withApp(app, async (url) => {
      const alice = await fetch(`${url}/account`, {
        headers: { "x-subject": ALICE },
      });
      expect(alice.status).toBe(200);

      const bob = await fetch(`${url}/account`, {
        headers: { "x-subject": BOB },
      });
      expect(bob.status).toBe(403);

      const again = await fetch(`${url}/whoami`, {
        headers: { "x-subject": BOB },
      });
      expect(await again.json()).toEqual({
        subject: BOB,
        kind: SubjectType.User,
        can: "function",
      });
    });
  });
});

describe("AbilityGuard", () => {
  test("reuses the hydrated ability for custom guards", async () => {
    const { app, service } = await harness();

    await withApp(app, async (url) => {
      const denied = await fetch(`${url}/owner/1`, {
        headers: { "x-subject": ALICE },
      });
      expect(denied.status).toBe(403);

      await service.setPermission(WS, ALICE, "workspaces.1.owner", true);
      const allowed = await fetch(`${url}/owner/1`, {
        headers: { "x-subject": ALICE },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ owner: true });
    });
  });

  test("exposes the hydrated subject and kind helpers", async () => {
    const { app, service } = await harness();
    await service.setPermission(WS, ALICE, "account.active", true);

    await withApp(app, async (url) => {
      const own = await fetch(`${url}/self/${ALICE}`, {
        headers: { "x-subject": ALICE },
      });
      expect(own.status).toBe(200);

      const foreign = await fetch(`${url}/self/${BOB}`, {
        headers: { "x-subject": ALICE },
      });
      expect(foreign.status).toBe(403);
    });
  });

  test("fails clearly when the request context is missing", async () => {
    const app = await createTestApp({
      controllers: [GuardController],
      providers: [WorkspaceOwnerGuard, SelfGuard],
    });
    app.useLogger(false);

    await withApp(app, async (url) => {
      const response = await fetch(`${url}/owner/1`, {
        headers: { "x-subject": ALICE },
      });
      expect(response.status).toBe(500);
    });
  });
});
