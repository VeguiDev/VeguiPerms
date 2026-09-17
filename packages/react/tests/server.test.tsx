import { describe, expect, test } from "bun:test";
import {
  createVPerms,
  getAbility,
  getResolvedSubject,
  MISSING_INSTANCE_MESSAGE,
  type ResolvedSubject,
  ServerAbility,
} from "@vperms/react/server";
import {
  ALICE,
  buildSubject,
  createScopeCache,
  jsonResponse,
  startServer,
} from "./helpers";

const BOB = buildSubject({
  id: "bob",
  parents: [],
  permissions: [{ permission: "account.active", value: true, weight: 10 }],
});

describe("server instance not configured", () => {
  test("fails with a clear error before createVPerms()", async () => {
    await expect(getAbility()).rejects.toThrow(MISSING_INSTANCE_MESSAGE);
  });
});

describe("ServerAbility", () => {
  test("renders children when allowed and fallback when denied", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    try {
      createVPerms(server.url);

      expect(
        await ServerAbility({
          permission: "account.active",
          children: "YEP",
          fallback: "NOPE",
        }),
      ).toBe("YEP");

      expect(
        await ServerAbility({
          permission: "admin.users.delete",
          children: "YEP",
          fallback: "NOPE",
        }),
      ).toBe("NOPE");
    } finally {
      server.close();
    }
  });

  test("requires all permissions by default", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    try {
      createVPerms(server.url);

      expect(
        await ServerAbility({
          permissions: ["account.active", "reports.daily"],
          children: "YEP",
          fallback: "NOPE",
        }),
      ).toBe("YEP");

      expect(
        await ServerAbility({
          permissions: ["account.active", "admin.users.delete"],
          children: "YEP",
          fallback: "NOPE",
        }),
      ).toBe("NOPE");
    } finally {
      server.close();
    }
  });

  test("allows any permission when any is set", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    try {
      createVPerms(server.url);

      expect(
        await ServerAbility({
          any: true,
          permissions: ["admin.users.delete", "reports.daily"],
          children: "YEP",
          fallback: "NOPE",
        }),
      ).toBe("YEP");

      expect(
        await ServerAbility({
          any: true,
          permissions: ["admin.users.delete", "account.inactive"],
          children: "YEP",
          fallback: "NOPE",
        }),
      ).toBe("NOPE");
    } finally {
      server.close();
    }
  });
});

describe("standalone helpers", () => {
  test("getResolvedSubject and getAbility use the default instance", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    try {
      createVPerms(server.url);

      const subject = await getResolvedSubject();
      expect(subject.id).toBe("alice");

      const ability = await getAbility();
      expect(ability.can("account.active")).toBe(true);
    } finally {
      server.close();
    }
  });

  test("Provider returns a bridge element carrying the snapshot", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    try {
      const vperms = createVPerms(server.url);
      const element = await vperms.Provider({ children: "X" });
      const props = (element as { props: { subject: ResolvedSubject } }).props;

      expect(props.subject.id).toBe("alice");
      expect(props.subject).toEqual(ALICE);
    } finally {
      server.close();
    }
  });
});

describe("request scoping", () => {
  test("reuses one resolved subject per scope", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    try {
      const scopes = createScopeCache();
      const vperms = createVPerms(server.url, { cache: scopes.cache });

      await scopes.run(async () => {
        const ability = await vperms.getAbility();
        const subject = await vperms.getResolvedSubject();

        expect(ability.can("account.active")).toBe(true);
        expect(subject.id).toBe("alice");
      });

      expect(server.requests).toEqual(["/vperms/subject/me"]);
    } finally {
      server.close();
    }
  });

  test("does not leak state across independent scopes", async () => {
    let call = 0;
    const server = startServer(() => {
      call += 1;
      return jsonResponse(call === 1 ? ALICE : BOB);
    });

    try {
      const scopes = createScopeCache();
      const vperms = createVPerms(server.url, { cache: scopes.cache });

      const first = await scopes.run(() => vperms.getResolvedSubject());
      const second = await scopes.run(() => vperms.getResolvedSubject());

      expect(first.id).toBe("alice");
      expect(second.id).toBe("bob");
      expect(server.requests).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});
