"use client";

import type { VPermsConfig } from "@vperms/client";
import {
  type ClientVPerms,
  createVPerms as createReactClientVPerms,
} from "@vperms/react/client";
import type { BrowserConfig } from "../shared";

/**
 * Browser configuration produced by the server via `vperms.browserConfig`.
 * A custom `fetch` is accepted for non-browser runtimes and tests.
 */
export interface NextClientConfig extends BrowserConfig {
  fetch?: VPermsConfig["fetch"];
}

/**
 * Creates the browser-side VeguiPerms instance. The server already decided the
 * transport, so the browser only needs the serializable `browserConfig`.
 */
export function createNextVPerms(config: NextClientConfig): ClientVPerms {
  return createReactClientVPerms(config.origin, {
    prefix: config.prefix,
    fetchOptions: config.fetchOptions,
    fetch: config.fetch,
  });
}

export * from "@vperms/react/client";
export type { BrowserConfig };
