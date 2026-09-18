import { describe, expect, test } from "bun:test";
import { createNextVPerms, nextBackend } from "@vperms/next/server";
import type { ReactElement } from "react";
import { PermissionDeniedError, SubjectType } from "vperms";
import { createScopeCache, seed, WS } from "./helpers";

function localVPerms(
  adapter: Parameters<typeof nextBackend>[0]["adapter"],
  subjectResolver: Parameters<typeof nextBackend>[0]["subjectResolver"],
  cache?: Parameters<typeof createNextVPerms>[0]["cache"],
) {
  return createNextVPerms({
    backend: nextBackend({ adapter, workspace: WS, subjectResolver }),
    cache,
  });
}

describe("NextBackend server resolution", () => {
  test("resolves the current subject directly through the adapter", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, () => "alice");

    const dto = await vperms.getResolvedSubject();
    expect(dto.id).toBe("alice");
    expect(dto.type).toBe(SubjectType.User);

    const ability = await vperms.getAbility();
    expect(ability.can("posts.read")).toBe(true);
    expect(ability.can("posts.missing")).toBe(false);
  });

  test("provides a default anonymous subject", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, () => null);

    const dto = await vperms.getResolvedSubject();
    expect(dto.id).toBe("anonymous");
    expect(dto.type).toBe(SubjectType.Anon);
  });

  test("authorizes reading another subject with the current ability", async () => {
    const { adapter, service } = await seed();
    const vperms = localVPerms(adapter, () => "alice");

    await expect(vperms.getResolvedSubject("bob")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );

    await service.setPermission(
      WS,
      "alice",
      "vperms.subject.bob.permissions",
      true,
    );

    const allowed = await vperms.getResolvedSubject("bob");
    expect(allowed.id).toBe("bob");
  });

  test("resolves the request subject once per render scope", async () => {
    const { adapter } = await seed();
    const scope = createScopeCache();
    let resolverCalls = 0;
    const vperms = localVPerms(
      adapter,
      () => {
        resolverCalls += 1;
        return "alice";
      },
      scope.cache,
    );

    await scope.run(async () => {
      await vperms.getResolvedSubject();
      await vperms.getAbility();
      await vperms.getAbility();
    });

    expect(resolverCalls).toBe(1);
  });

  test("does not leak state between render scopes", async () => {
    const { adapter } = await seed();
    const scope = createScopeCache();
    let current = "alice";
    const vperms = localVPerms(adapter, () => current, scope.cache);

    const first = await scope.run(() => vperms.getResolvedSubject());
    current = "bob";
    const second = await scope.run(() => vperms.getResolvedSubject());

    expect(first.id).toBe("alice");
    expect(second.id).toBe("bob");
  });
});

describe("instance Ability component", () => {
  test("supports ALL, ANY and fallback semantics", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, () => "alice");

    expect(
      await vperms.Ability({ permission: "posts.read", children: "YEP" }),
    ).toBe("YEP");
    expect(
      await vperms.Ability({
        permission: "posts.missing",
        children: "YEP",
        fallback: "NOPE",
      }),
    ).toBe("NOPE");
    expect(
      await vperms.Ability({
        permissions: ["posts.read", "posts.update"],
        children: "YEP",
      }),
    ).toBe("YEP");
    expect(
      await vperms.Ability({
        permissions: ["posts.read", "posts.missing"],
        children: "YEP",
      }),
    ).toBeNull();
    expect(
      await vperms.Ability({
        any: true,
        permissions: ["posts.missing", "posts.read"],
        children: "YEP",
      }),
    ).toBe("YEP");
    expect(
      await vperms.Ability({
        any: true,
        permissions: ["posts.missing", "posts.update.missing"],
        children: "YEP",
      }),
    ).toBeNull();
  });

  test("Provider bridges the resolved snapshot to the client provider", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, () => "alice");

    const element = (await vperms.Provider({
      children: "KIDS",
    })) as ReactElement<{
      subject: { id: string };
      children: string;
    }>;

    expect(element.props.subject.id).toBe("alice");
    expect(element.props.children).toBe("KIDS");
  });
});

describe("instance handlers", () => {
  const resolver = (request?: Request) =>
    request?.headers.get("x-subject") ?? "alice";

  test("serves the current subject", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/subject/me"),
    );

    expect(response.status).toBe(200);
    const dto = (await response.json()) as { id: string };
    expect(dto.id).toBe("alice");
  });

  test("denies a foreign subject without a grant", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/subject/alice", {
        headers: { "x-subject": "bob" },
      }),
    );

    expect(response.status).toBe(403);
  });

  test("allows a foreign subject through a wildcard grant", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/subject/alice", {
        headers: { "x-subject": "auditor" },
      }),
    );

    expect(response.status).toBe(200);
    const dto = (await response.json()) as { id: string };
    expect(dto.id).toBe("alice");
  });

  test("returns 404 for an unknown target subject", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/subject/ghost", {
        headers: { "x-subject": "auditor" },
      }),
    );

    expect(response.status).toBe(404);
  });

  test("uses catch-all params as the authoritative path", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/ignored"),
      { params: Promise.resolve({ path: ["subject", "me"] }) },
    );

    expect(response.status).toBe(200);
    const dto = (await response.json()) as { id: string };
    expect(dto.id).toBe("alice");
  });

  test("falls back to the request URL when params are absent", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/subject/me"),
    );

    expect(response.status).toBe(200);
  });

  test("returns 404 for unrelated paths", async () => {
    const { adapter } = await seed();
    const vperms = localVPerms(adapter, resolver);

    const response = await vperms.handlers.GET(
      new Request("http://localhost/vperms/other/me"),
    );

    expect(response.status).toBe(404);
  });
});
