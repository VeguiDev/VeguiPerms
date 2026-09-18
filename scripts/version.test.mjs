import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverPublicPackages,
  nextVersion,
  PUBLIC_PACKAGE_NAMES,
  PUBLISH_ORDER,
  rewriteWorkspaceDeps,
} from "./version.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("nextVersion", () => {
  test("uses major.minor and the run number as patch", () => {
    expect(nextVersion("0.0.0", 46)).toBe("0.0.46");
    expect(nextVersion("0.0.0", 1)).toBe("0.0.1");
    expect(nextVersion("1.2.3", 7)).toBe("1.2.7");
  });

  test("rejects invalid input", () => {
    expect(() => nextVersion("nope", 1)).toThrow();
    expect(() => nextVersion("0.0.0", 1.5)).toThrow();
    expect(() => nextVersion("0.0.0", -1)).toThrow();
  });
});

describe("rewriteWorkspaceDeps", () => {
  test("sets the ephemeral version", () => {
    const rewritten = rewriteWorkspaceDeps(
      { name: "@vperms/core", version: "0.0.0" },
      "0.0.46",
    );

    expect(rewritten.version).toBe("0.0.46");
  });

  test("pins public workspace deps and drops private ones", () => {
    const manifest = {
      name: "@vperms/nest",
      version: "0.0.0",
      dependencies: { vperms: "workspace:*" },
      devDependencies: {
        "@vperms/express": "workspace:*",
        "@vperms/adapter-contract": "workspace:*",
        zod: "^4.0.0",
      },
      peerDependencies: { "@nestjs/common": "^11.0.0" },
    };

    const rewritten = rewriteWorkspaceDeps(manifest, "0.0.46");

    expect(rewritten.dependencies).toEqual({ vperms: "0.0.46" });
    expect(rewritten.devDependencies).toEqual({
      "@vperms/express": "0.0.46",
      zod: "^4.0.0",
    });
    expect(rewritten.peerDependencies).toEqual({ "@nestjs/common": "^11.0.0" });
    expect(manifest.dependencies.vperms).toBe("workspace:*");
  });

  test("removes emptied dependency fields", () => {
    const rewritten = rewriteWorkspaceDeps(
      { devDependencies: { "@vperms/adapter-contract": "workspace:*" } },
      "0.0.1",
    );

    expect(rewritten.devDependencies).toBeUndefined();
  });

  test("leaves non-workspace ranges untouched", () => {
    const rewritten = rewriteWorkspaceDeps(
      { dependencies: { zod: "^4.6.5" } },
      "0.0.1",
    );

    expect(rewritten.dependencies).toEqual({ zod: "^4.6.5" });
  });
});

describe("discoverPublicPackages", () => {
  test("discovers the eleven public packages in dependency order", () => {
    const packages = discoverPublicPackages(path.join(root, "packages"));

    expect(packages.map((pkg) => pkg.name)).toEqual([...PUBLISH_ORDER]);
    expect(PUBLIC_PACKAGE_NAMES.size).toBe(11);
  });
});
