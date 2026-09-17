import { describe, expect, test } from "bun:test";
import {
  createAbility,
  createVPerms,
  fetchResolvedSubject,
  VPermsHttpError,
} from "@vperms/client";
import { canResolved, SubjectType } from "vperms";
import {
  buildSubject,
  jsonResponse,
  type RecordedCall,
  recordingFetch,
  startServer,
} from "./helpers";

const ALICE = buildSubject();

const CHECKS = [
  "workspaces.1.read",
  "workspaces.2.read",
  "account.active",
  "account.inactive",
  "admin.users.delete",
  "reports.daily.summary",
  "reports",
  "unrelated.permission",
];

describe("PermissionAbility", () => {
  test("createAbility exposes the immutable snapshot", () => {
    const ability = createAbility(ALICE);

    expect(ability.subject).toEqual(ALICE);
    expect(ability.permissions).toEqual(ALICE.permissions);
    expect(ability.permissions).not.toBe(ALICE.permissions);
  });

  test("allows an exact grant", () => {
    expect(createAbility(ALICE).can("workspaces.1.read")).toBe(true);
  });

  test("honours an exact deny", () => {
    expect(createAbility(ALICE).can("workspaces.2.read")).toBe(false);
  });

  test("matches trailing wildcards", () => {
    expect(createAbility(ALICE).can("reports.daily.summary")).toBe(true);
    expect(createAbility(ALICE).can("reports")).toBe(true);
  });

  test("prefers the highest weight", () => {
    const ability = createAbility(ALICE);

    expect(ability.can("workspaces.1.read")).toBe(true);
    expect(ability.can("admin.users.delete")).toBe(false);
  });

  test("returns false when nothing matches", () => {
    expect(createAbility(ALICE).can("unrelated.permission")).toBe(false);
  });

  test("matches core canResolved() for every permission", () => {
    const ability = createAbility(ALICE);

    for (const permission of CHECKS) {
      expect(ability.can(permission)).toBe(
        canResolved(ALICE.permissions, permission),
      );
    }
  });
});

describe("fetchResolvedSubject", () => {
  test("validates and returns a resolved subject", async () => {
    const subject = await fetchResolvedSubject("http://example.test/me", {
      fetch: async () => jsonResponse(ALICE),
    });

    expect(subject).toEqual(ALICE);
  });

  test("throws VPermsHttpError on a non-2xx response", async () => {
    await expect(
      fetchResolvedSubject("http://example.test/me", {
        fetch: async () => jsonResponse({ error: "nope" }, 403),
      }),
    ).rejects.toBeInstanceOf(VPermsHttpError);

    try {
      await fetchResolvedSubject("http://example.test/me", {
        fetch: async () => jsonResponse({ error: "nope" }, 500),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(VPermsHttpError);
      expect((error as VPermsHttpError).status).toBe(500);
      expect((error as VPermsHttpError).url).toBe("http://example.test/me");
    }
  });

  test("rejects JSON that fails schema validation", async () => {
    await expect(
      fetchResolvedSubject("http://example.test/me", {
        fetch: async () => jsonResponse({ id: "alice" }),
      }),
    ).rejects.toThrow();
  });
});

describe("createVPerms", () => {
  test("loads the current subject from /subject/me", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url);
      const subject = await client.getResolvedSubject();

      expect(subject).toEqual(ALICE);
      expect(server.requests).toEqual(["/vperms/subject/me"]);
    } finally {
      server.close();
    }
  });

  test("treats a null resolver as anonymous via /subject/me", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url, { subjectResolver: () => null });
      await client.getResolvedSubject();

      expect(server.requests).toEqual(["/vperms/subject/me"]);
    } finally {
      server.close();
    }
  });

  test("loads an explicit subject from /subject/:subjectId", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url);
      await client.getResolvedSubject("bob");

      expect(server.requests).toEqual(["/vperms/subject/bob"]);
    } finally {
      server.close();
    }
  });

  test("encodes the subject id", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url);
      await client.getResolvedSubject("a b/c");

      expect(server.requests).toEqual(["/vperms/subject/a%20b%2Fc"]);
    } finally {
      server.close();
    }
  });

  test("resolves the subject from a SubjectId resolver", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url, {
        subjectResolver: () => "carol",
      });
      await client.getResolvedSubject();

      expect(server.requests).toEqual(["/vperms/subject/carol"]);
    } finally {
      server.close();
    }
  });

  test("resolves the subject from a Principal resolver", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url, {
        subjectResolver: () => ({
          getSubjectId: () => "dave",
        }),
      });
      await client.getResolvedSubject();

      expect(server.requests).toEqual(["/vperms/subject/dave"]);
    } finally {
      server.close();
    }
  });

  test("supports an async resolver", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url, {
        subjectResolver: async () => "erin",
      });
      await client.getResolvedSubject();

      expect(server.requests).toEqual(["/vperms/subject/erin"]);
    } finally {
      server.close();
    }
  });

  test("getAbility returns a PermissionAbility", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url);
      const ability = await client.getAbility();

      expect(ability.can("account.active")).toBe(true);
      expect(ability.can("admin.users.delete")).toBe(false);
      expect(ability.subject).toEqual(ALICE);
    } finally {
      server.close();
    }
  });

  test("getAbility loads an explicit subject", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url);
      await client.getAbility("frank");

      expect(server.requests).toEqual(["/vperms/subject/frank"]);
    } finally {
      server.close();
    }
  });

  test("uses a custom prefix", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const client = createVPerms(server.url, { prefix: "/api/iam" });
      await client.getResolvedSubject();

      expect(server.requests).toEqual(["/api/iam/subject/me"]);
      expect(client.prefix).toBe("/api/iam");
    } finally {
      server.close();
    }
  });

  test("normalizes a missing or trailing-slash prefix", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      await createVPerms(server.url, { prefix: "" }).getResolvedSubject();
      await createVPerms(server.url, { prefix: "iam" }).getResolvedSubject();
      await createVPerms(server.url, { prefix: "/iam/" }).getResolvedSubject();

      expect(server.requests).toEqual([
        "/subject/me",
        "/iam/subject/me",
        "/iam/subject/me",
      ]);
    } finally {
      server.close();
    }
  });

  test("defaults the prefix to /vperms", async () => {
    const recording = recordingFetch(() => jsonResponse(ALICE));
    const client = createVPerms("https://api.example.com", {
      fetch: recording.fetch,
    });

    expect(client.prefix).toBe("/vperms");
    await client.getResolvedSubject();
    expect(recording.calls[0]?.url).toBe(
      "https://api.example.com/vperms/subject/me",
    );
  });

  test("supports a relative origin", async () => {
    const recording = recordingFetch(() => jsonResponse(ALICE));
    await createVPerms("/api", { fetch: recording.fetch }).getResolvedSubject();

    expect(recording.calls[0]?.url).toBe("/api/vperms/subject/me");
  });

  test("supports an empty origin", async () => {
    const recording = recordingFetch(() => jsonResponse(ALICE));
    await createVPerms("", { fetch: recording.fetch }).getResolvedSubject();

    expect(recording.calls[0]?.url).toBe("/vperms/subject/me");
  });

  test("forwards custom fetch options", async () => {
    const recording = recordingFetch(() => jsonResponse(ALICE));
    await createVPerms("https://api.example.com", {
      fetch: recording.fetch,
      fetchOptions: { credentials: "include" },
    }).getResolvedSubject();

    const call = recording.calls[0] as RecordedCall;
    expect(call.init?.credentials).toBe("include");
  });
});

describe("SubjectType re-export", () => {
  test("is available to client consumers", () => {
    expect(String(SubjectType.User)).toBe("user");
  });
});
