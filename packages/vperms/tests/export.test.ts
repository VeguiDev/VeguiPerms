import { describe, expect, test } from "bun:test";
import {
  createAbility,
  exportResolvedSubject,
  InvalidSubjectIdError,
  PermissionDeniedError,
  parsePermissionsExportPath,
  SubjectNotFoundError,
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";
const ALICE = "alice";
const BOB = "bob";

async function seed() {
  const adapter = new VeguiPermsMemoryAdapter();
  const service = new VeguiPermsService({ adapter });
  await service.saveSubject(WS, {
    id: ALICE,
    type: SubjectType.User,
    parents: [],
  });
  await service.saveSubject(WS, {
    id: BOB,
    type: SubjectType.User,
    parents: [],
  });
  await service.setPermission(WS, ALICE, "workspaces.1.read", true);
  return { adapter, service };
}

describe("parsePermissionsExportPath", () => {
  test("parses a simple subject path", () => {
    const parsed = parsePermissionsExportPath("/subject/:subjectId");

    expect(parsed.base).toBe("subject");
    expect(parsed.routePattern).toBe(":subjectId");
    expect(parsed.param).toBe("subjectId");
    expect(parsed.match("/subject/123")).toEqual({ subjectId: "123" });
    expect(parsed.match("/subject/123/permissions")).toBeNull();
    expect(parsed.match("/other/123")).toBeNull();
    expect(parsed.match("/subject/")).toBeNull();
  });

  test("normalizes a path without a leading slash", () => {
    const parsed = parsePermissionsExportPath("subject/:subjectId");
    expect(parsed.match("/subject/123")).toEqual({ subjectId: "123" });
  });

  test("supports a trailing sub-path", () => {
    const parsed = parsePermissionsExportPath("/subject/:subjectId/view");
    expect(parsed.base).toBe("subject");
    expect(parsed.routePattern).toBe(":subjectId/view");
    expect(parsed.match("/subject/123/view")).toEqual({ subjectId: "123" });
  });

  test("decodes an encoded parameter", () => {
    const parsed = parsePermissionsExportPath("/subject/:subjectId");
    expect(parsed.match("/subject/a%20b")).toEqual({ subjectId: "a b" });
  });

  test("rejects a path without a parameter", () => {
    expect(() => parsePermissionsExportPath("/subject")).toThrow(
      /parameter segment/,
    );
  });

  test("rejects a path with multiple parameters", () => {
    expect(() => parsePermissionsExportPath("/:a/:b")).toThrow(
      /parameter segment/,
    );
  });
});

describe("exportResolvedSubject", () => {
  test("exports the current subject without an explicit grant", async () => {
    const { adapter, service } = await seed();
    const ability = createAbility(service, WS, BOB);

    const dto = await exportResolvedSubject({
      service,
      adapter,
      workspaceId: WS,
      currentSubjectId: BOB,
      targetSubjectId: BOB,
      ability,
    });

    expect(dto.id).toBe(BOB);
    expect(dto.parents).toEqual([]);
    expect(
      dto.permissions.some(
        (entry) => entry.permission === "vperms.subject.me.permissions",
      ),
    ).toBe(true);
  });

  test("treats the literal 'me' as the current subject", async () => {
    const { adapter, service } = await seed();
    const ability = createAbility(service, WS, BOB);

    const dto = await exportResolvedSubject({
      service,
      adapter,
      workspaceId: WS,
      currentSubjectId: BOB,
      targetSubjectId: "me",
      ability,
    });

    expect(dto.id).toBe(BOB);
  });

  test("denies a foreign subject without a grant", async () => {
    const { adapter, service } = await seed();
    const ability = createAbility(service, WS, BOB);

    await expect(
      exportResolvedSubject({
        service,
        adapter,
        workspaceId: WS,
        currentSubjectId: BOB,
        targetSubjectId: ALICE,
        ability,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("allows a foreign subject with an explicit grant", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(
      WS,
      BOB,
      `vperms.subject.${ALICE}.permissions`,
      true,
    );
    const ability = createAbility(service, WS, BOB);

    const dto = await exportResolvedSubject({
      service,
      adapter,
      workspaceId: WS,
      currentSubjectId: BOB,
      targetSubjectId: ALICE,
      ability,
    });

    expect(dto.id).toBe(ALICE);
  });

  test("authorizes before checking existence", async () => {
    const { adapter, service } = await seed();
    const ability = createAbility(service, WS, BOB);

    await expect(
      exportResolvedSubject({
        service,
        adapter,
        workspaceId: WS,
        currentSubjectId: BOB,
        targetSubjectId: "ghost",
        ability,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("throws SubjectNotFoundError when authorized but missing", async () => {
    const { adapter, service } = await seed();
    await service.setPermission(
      WS,
      BOB,
      "vperms.subject.ghost.permissions",
      true,
    );
    const ability = createAbility(service, WS, BOB);

    await expect(
      exportResolvedSubject({
        service,
        adapter,
        workspaceId: WS,
        currentSubjectId: BOB,
        targetSubjectId: "ghost",
        ability,
      }),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  test("throws InvalidSubjectIdError for a malformed id", async () => {
    const { adapter, service } = await seed();
    const ability = createAbility(service, WS, BOB);

    await expect(
      exportResolvedSubject({
        service,
        adapter,
        workspaceId: WS,
        currentSubjectId: BOB,
        targetSubjectId: "",
        ability,
      }),
    ).rejects.toBeInstanceOf(InvalidSubjectIdError);
  });
});
