import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type Subject,
  SubjectType,
  type VeguiPermsAdapter,
} from "@vperms/core";

/**
 * Everything a contract run needs to exercise an adapter. `migrate` and
 * `cleanup` are optional so pure in-memory adapters can be used as-is.
 */
export interface AdapterHarness {
  adapter: VeguiPermsAdapter;

  /**
   * Called once before each test. Database adapters should trigger their
   * explicit migration here so every test starts from a ready schema.
   */
  migrate?(): Promise<void>;

  /**
   * Called after each test, e.g. to drop a database or close a connection.
   */
  cleanup?(): Promise<void>;
}

export type AdapterFactory = () => AdapterHarness | Promise<AdapterHarness>;

const WS = "workspace";
const OTHER = "other";

function subject(id: string, parents: string[] = []): Subject {
  return { id, type: SubjectType.Group, parents };
}

/**
 * Runs the shared persistence contract against any {@link VeguiPermsAdapter}.
 *
 * The same suite is executed for the in-memory reference adapter and for every
 * database adapter, so all of them are guaranteed to behave identically at the
 * persistence boundary.
 */
export function runAdapterContractTests(
  name: string,
  factory: AdapterFactory,
): void {
  describe(name, () => {
    let harness: AdapterHarness;
    let adapter: VeguiPermsAdapter;

    beforeEach(async () => {
      harness = await factory();
      adapter = harness.adapter;
      await harness.migrate?.();
    });

    afterEach(async () => {
      await harness.cleanup?.();
    });

    test("namespaces subjects by workspace", async () => {
      await adapter.saveSubject(WS, subject("team"));

      expect(await adapter.findSubject(WS, "team")).not.toBeNull();
      expect(await adapter.findSubject(OTHER, "team")).toBeNull();
    });

    test("returns null for an unknown subject", async () => {
      expect(await adapter.findSubject(WS, "missing")).toBeNull();
    });

    test("upserts an existing subject", async () => {
      await adapter.saveSubject(WS, subject("team"));
      await adapter.saveSubject(WS, {
        id: "team",
        type: SubjectType.User,
        parents: ["parent"],
      });

      const found = await adapter.findSubject(WS, "team");
      expect(found).toEqual({
        id: "team",
        type: SubjectType.User,
        parents: ["parent"],
      });
    });

    test("persists subject parents", async () => {
      await adapter.saveSubject(WS, subject("team", ["a", "b"]));

      expect((await adapter.findSubject(WS, "team"))?.parents.sort()).toEqual([
        "a",
        "b",
      ]);
    });

    test("returns an empty grant list for an unknown subject", async () => {
      expect(await adapter.findSubjectGrants(WS, "missing")).toEqual([]);
    });

    test("upserts a single grant per permission", async () => {
      await adapter.grantPermission(WS, "team", "workspaces.1.read", true);
      await adapter.grantPermission(WS, "team", "workspaces.1.read", false);

      const grants = await adapter.findSubjectGrants(WS, "team");

      expect(grants).toHaveLength(1);
      expect(grants[0]?.value).toBe(false);
    });

    test("finds grants by workspace and subject", async () => {
      await adapter.grantPermission(WS, "team", "workspaces.1.read", true);
      await adapter.grantPermission(WS, "other", "workspaces.1.read", true);
      await adapter.grantPermission(OTHER, "team", "workspaces.1.read", true);
      await adapter.grantPermission(WS, "team", "workspaces.1.write", false);

      const grants = await adapter.findSubjectGrants(WS, "team");

      expect(
        grants.map((grant) => `${grant.permission}=${grant.value}`).sort(),
      ).toEqual(["workspaces.1.read=true", "workspaces.1.write=false"]);
    });

    test("ungrantPermission removes the grant", async () => {
      await adapter.grantPermission(WS, "team", "workspaces.1.read", true);

      expect(
        await adapter.ungrantPermission(WS, "team", "workspaces.1.read"),
      ).toBe(true);
      expect(await adapter.findSubjectGrants(WS, "team")).toEqual([]);
    });

    test("ungrantPermission reports missing grants as false", async () => {
      expect(
        await adapter.ungrantPermission(WS, "team", "workspaces.1.read"),
      ).toBe(false);
    });

    test("deleteSubject only removes from its workspace", async () => {
      await adapter.saveSubject(WS, subject("team"));
      await adapter.saveSubject(OTHER, subject("team"));

      expect(await adapter.deleteSubject(WS, "team")).toBe(true);
      expect(await adapter.findSubject(WS, "team")).toBeNull();
      expect(await adapter.findSubject(OTHER, "team")).not.toBeNull();
    });

    test("deleteSubject reports missing subjects as false", async () => {
      expect(await adapter.deleteSubject(WS, "missing")).toBe(false);
    });
  });
}
