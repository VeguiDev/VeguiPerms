import { describe, expect, test } from "bun:test";
import {
  Ability,
  AbilityProvider,
  ClientAbility,
  createNextVPerms,
  MISSING_PROVIDER_MESSAGE,
  useAbility,
} from "@vperms/next/client";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ALICE, buildSubject, jsonResponse, startServer } from "./helpers";

function Probe({ permission }: { permission: string }) {
  const ability = useAbility();
  return <span>{ability.can(permission) ? "yes" : "no"}</span>;
}

function render(children: ReactNode): string {
  return renderToStaticMarkup(children);
}

describe("next client entrypoint", () => {
  test("exposes the client ability as the universal Ability", () => {
    expect(Ability).toBe(ClientAbility);
  });

  test("hydrates the provider from a ResolvedSubject", () => {
    const markup = render(
      <AbilityProvider subject={ALICE}>
        <Probe permission="posts.read" />
      </AbilityProvider>,
    );

    expect(markup).toContain("yes");
  });

  test("denies permissions absent from the snapshot", () => {
    const markup = render(
      <AbilityProvider subject={ALICE}>
        <Probe permission="admin.users.delete" />
      </AbilityProvider>,
    );

    expect(markup).toContain("no");
  });

  test("throws a clear error without a provider", () => {
    expect(() => render(<Probe permission="posts.read" />)).toThrow(
      MISSING_PROVIDER_MESSAGE,
    );
  });

  test("rehydrates when the snapshot changes", () => {
    const revoked = buildSubject({
      permissions: [{ permission: "posts.read", value: false, weight: 200 }],
    });

    const allowed = render(
      <AbilityProvider subject={ALICE}>
        <Probe permission="posts.read" />
      </AbilityProvider>,
    );
    const denied = render(
      <AbilityProvider subject={revoked}>
        <Probe permission="posts.read" />
      </AbilityProvider>,
    );

    expect(allowed).toContain("yes");
    expect(denied).toContain("no");
  });

  test("supports fallback, ALL and ANY semantics", () => {
    const markup = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility
          permission="admin.users.delete"
          fallback={<span>NOPE</span>}
        >
          <span>YEP</span>
        </ClientAbility>
        <ClientAbility permissions={["posts.read", "posts.update"]}>
          <span>ALL</span>
        </ClientAbility>
        <ClientAbility any permissions={["nope", "posts.read"]}>
          <span>ANY</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    expect(markup).toContain("NOPE");
    expect(markup).toContain("ALL");
    expect(markup).toContain("ANY");
  });
});

describe("next client transport", () => {
  test("loads from an absolute origin", async () => {
    const server = startServer(() => jsonResponse(ALICE));
    const vperms = createNextVPerms({ origin: server.url, prefix: "/api" });

    const dto = await vperms.getResolvedSubject();
    expect(dto).toEqual(ALICE);
    expect(server.requests).toContain("/api/subject/me");

    server.close();
  });

  test("loads from a same-origin proxy prefix", async () => {
    const calls: string[] = [];
    const vperms = createNextVPerms({
      origin: "",
      prefix: "/vperms",
      fetch: async (input) => {
        calls.push(input);
        return jsonResponse(ALICE);
      },
    });

    const dto = await vperms.getResolvedSubject();
    expect(dto).toEqual(ALICE);
    expect(calls).toEqual(["/vperms/subject/me"]);
  });
});
