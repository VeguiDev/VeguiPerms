import { describe, expect, test } from "bun:test";
import {
  AbilityProvider,
  ClientAbility,
  createAbility,
  Ability as UniversalAbility,
  useAbility,
} from "@vperms/react";
import {
  createVPerms as createServerVPerms,
  ServerAbility,
} from "@vperms/react/server";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ALICE, jsonResponse, startServer } from "./helpers";

const CHECKS = [
  "workspaces.1.read",
  "workspaces.2.read",
  "account.active",
  "admin.users.delete",
  "reports.daily",
  "unrelated.permission",
];

function Probe({ permission }: { permission: string }) {
  const ability = useAbility();
  return <span>{ability.can(permission) ? "yes" : "no"}</span>;
}

function render(children: ReactNode): string {
  return renderToStaticMarkup(children);
}

describe("universal Ability export (client condition)", () => {
  test("the client entrypoint is selected by default", () => {
    expect(UniversalAbility).toBe(ClientAbility);
  });
});

describe("server and client abilities agree", () => {
  test("both produce identical decisions for the same snapshot", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const vperms = createServerVPerms(server.url);
      const resolved = await vperms.getResolvedSubject();
      const serverAbility = await vperms.getAbility();
      const clientAbility = createAbility(resolved);

      for (const permission of CHECKS) {
        expect(clientAbility.can(permission)).toBe(
          serverAbility.can(permission),
        );
      }
    } finally {
      server.close();
    }
  });

  test("the client provider hydrates to the same decisions", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const vperms = createServerVPerms(server.url);
      const resolved = await vperms.getResolvedSubject();
      const serverAbility = await vperms.getAbility();

      for (const permission of CHECKS) {
        const markup = render(
          <AbilityProvider subject={resolved}>
            <Probe permission={permission} />
          </AbilityProvider>,
        );

        expect(markup).toContain(serverAbility.can(permission) ? "yes" : "no");
      }
    } finally {
      server.close();
    }
  });

  test("server Provider bridges the exact snapshot into the client provider", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      const vperms = createServerVPerms(server.url);
      const element = await vperms.Provider({
        children: <Probe permission="account.active" />,
      });

      const markup = render(element);
      expect(markup).toContain("yes");
    } finally {
      server.close();
    }
  });

  test("ServerAbility evaluates the request ability", async () => {
    const server = startServer(() => jsonResponse(ALICE));

    try {
      createServerVPerms(server.url);

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
});
