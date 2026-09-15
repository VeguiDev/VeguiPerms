import { describe, expect, test } from "bun:test";
import type { PermissionGrant, Subject } from "vperms";
import {
  SubjectType,
  VeguiPermsMemoryAdapter,
  VeguiPermsService,
} from "vperms";

const WS = "workspace";
const USER = "user";

class CountingAdapter extends VeguiPermsMemoryAdapter {
  readonly lookedUp: string[] = [];

  override async findSubject(
    workspaceId: string,
    subjectId: string,
  ): Promise<Subject | null> {
    this.lookedUp.push(subjectId);
    return super.findSubject(workspaceId, subjectId);
  }

  override async findSubjectGrants(
    workspaceId: string,
    subjectId: string,
  ): Promise<PermissionGrant[]> {
    this.lookedUp.push(subjectId);
    return super.findSubjectGrants(workspaceId, subjectId);
  }
}

function group(id: string, parents: string[] = []): Subject {
  return { id, type: SubjectType.Group, parents };
}

describe("parent resolution is lazy", () => {
  test("does not look up parents when a direct grant matches", async () => {
    const adapter = new CountingAdapter();
    const vperms = new VeguiPermsService({ adapter });
    await vperms.saveSubject(WS, group(USER, ["team"]));
    await vperms.saveSubject(WS, group("team"));
    await vperms.setPermission(WS, USER, "workspaces.1.read", true);

    const result = await vperms.can(WS, USER, "workspaces.1.read");

    expect(result).toBe(true);
    const parentLookups = adapter.lookedUp.filter((id) => id !== USER);
    expect(parentLookups).toEqual([]);
  });

  test("looks up parents when no direct grant matches", async () => {
    const adapter = new CountingAdapter();
    const vperms = new VeguiPermsService({ adapter });
    await vperms.saveSubject(WS, group(USER, ["team"]));
    await vperms.saveSubject(WS, group("team"));
    await vperms.setPermission(WS, "team", "workspaces.1.read", true);

    const result = await vperms.can(WS, USER, "workspaces.1.read");

    expect(result).toBe(true);
    expect(adapter.lookedUp).toContain("team");
  });
});
