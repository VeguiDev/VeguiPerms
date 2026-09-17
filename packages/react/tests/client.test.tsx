import { describe, expect, test } from "bun:test";
import * as VPermsReact from "@vperms/react";
import {
  Ability,
  AbilityProvider,
  ClientAbility,
  MISSING_PROVIDER_MESSAGE,
  useAbility,
} from "@vperms/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ALICE, buildSubject } from "./helpers";

function Probe({ permission }: { permission: string }) {
  const ability = useAbility();
  return <span>{ability.can(permission) ? "yes" : "no"}</span>;
}

function render(children: ReactNode): string {
  return renderToStaticMarkup(children);
}

describe("buildClientVPerms / ability components", () => {
  test("exposes the client Ability as the universal Ability", () => {
    expect(Ability).toBe(ClientAbility);
  });

  test("ability is exposed through the root client entrypoint", () => {
    expect(typeof VPermsReact.useAbility).toBe("function");
    expect(typeof VPermsReact.AbilityProvider).toBe("function");
    expect(typeof VPermsReact.ClientAbility).toBe("function");
  });
});

describe("AbilityProvider + useAbility", () => {
  test("hydrates the client ability from a ResolvedSubject", () => {
    const markup = render(
      <AbilityProvider subject={ALICE}>
        <Probe permission="account.active" />
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
    expect(() => render(<Probe permission="account.active" />)).toThrow(
      MISSING_PROVIDER_MESSAGE,
    );
  });

  test("rehydrates when the snapshot changes", () => {
    const revoked = buildSubject({
      permissions: [
        { permission: "reports.*", value: false, weight: 200 },
        { permission: "account.active", value: true, weight: 100 },
      ],
    });

    const allowed = render(
      <AbilityProvider subject={ALICE}>
        <Probe permission="reports.daily" />
      </AbilityProvider>,
    );

    const denied = render(
      <AbilityProvider subject={revoked}>
        <Probe permission="reports.daily" />
      </AbilityProvider>,
    );

    expect(allowed).toContain("yes");
    expect(denied).toContain("no");
  });
});

describe("ClientAbility", () => {
  test("renders children when allowed", () => {
    const markup = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility permission="workspaces.1.read">
          <span>YEP</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    expect(markup).toContain("YEP");
  });

  test("renders fallback when denied", () => {
    const markup = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility
          permission="admin.users.delete"
          fallback={<span>NOPE</span>}
        >
          <span>YEP</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    expect(markup).toContain("NOPE");
    expect(markup).not.toContain("YEP");
  });

  test("requires all permissions by default", () => {
    const allowed = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility permissions={["account.active", "reports.daily"]}>
          <span>YEP</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    const denied = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility permissions={["account.active", "admin.users.delete"]}>
          <span>YEP</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    expect(allowed).toContain("YEP");
    expect(denied).not.toContain("YEP");
  });

  test("allows any permission when any is set", () => {
    const allowed = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility
          any
          permissions={["admin.users.delete", "reports.daily"]}
        >
          <span>YEP</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    const denied = render(
      <AbilityProvider subject={ALICE}>
        <ClientAbility
          any
          permissions={["admin.users.delete", "account.inactive"]}
        >
          <span>YEP</span>
        </ClientAbility>
      </AbilityProvider>,
    );

    expect(allowed).toContain("YEP");
    expect(denied).not.toContain("YEP");
  });
});
