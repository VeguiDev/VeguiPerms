import { describe, expect, test } from "bun:test";
import { vpermsMiddleware } from "@vperms/hono";
import { type ResolvedSubject, SubjectType } from "vperms";
import { appWith, seed, WS } from "./helpers";

const EXPORT = { path: "/subject/:subjectId" };

describe("permissions export", () => {
  test("exports the current subject's resolved permissions", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice", { permissionsExport: EXPORT });

    const response = await app.request("/subject/me");
    expect(response.status).toBe(200);
    const dto = (await response.json()) as ResolvedSubject;
    expect(dto.id).toBe("alice");
    expect(dto.type).toBe(SubjectType.User);
    expect(dto.permissions).toContainEqual({
      permission: "posts.read",
      value: true,
      weight: expect.any(Number),
    });
  });

  test("returns 403 for a foreign subject without permission", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "bob", { permissionsExport: EXPORT });

    expect((await app.request("/subject/alice")).status).toBe(403);
  });

  test("allows a foreign subject with an explicit grant", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(
      WS,
      "bob",
      "vperms.subject.alice.permissions",
      true,
    );
    const app = appWith(adapter, () => "bob", { permissionsExport: EXPORT });

    const response = await app.request("/subject/alice");
    expect(response.status).toBe(200);
    expect(((await response.json()) as ResolvedSubject).id).toBe("alice");
  });

  test("allows a foreign subject through a wildcard grant", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "auditor", {
      permissionsExport: EXPORT,
    });

    const response = await app.request("/subject/alice");
    expect(response.status).toBe(200);
    expect(((await response.json()) as ResolvedSubject).id).toBe("alice");
  });

  test("returns 404 when the target subject does not exist", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "auditor", {
      permissionsExport: EXPORT,
    });

    expect((await app.request("/subject/ghost")).status).toBe(404);
  });

  test("is disabled by default", async () => {
    const { adapter } = await seed();
    const app = appWith(adapter, () => "alice");

    expect((await app.request("/subject/me")).status).toBe(404);
  });

  test("rejects a path without a parameter segment", async () => {
    const { adapter } = await seed();
    expect(() =>
      vpermsMiddleware({
        adapter,
        workspace: WS,
        resolver: () => "alice",
        permissionsExport: { path: "/subject" },
      }),
    ).toThrow(/parameter segment/);
  });
});
