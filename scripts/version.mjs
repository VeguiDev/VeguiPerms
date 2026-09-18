import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const PUBLISH_ORDER = [
  "@vperms/core",
  "vperms",
  "@vperms/sql-adapter",
  "@vperms/client",
  "@vperms/react",
  "@vperms/express",
  "@vperms/hono",
  "@vperms/nest",
  "@vperms/drizzle-adapter",
  "@vperms/mongodb-adapter",
  "@vperms/next",
];

export const PUBLIC_PACKAGE_NAMES = new Set(PUBLISH_ORDER);

const WORKSPACE_PROTOCOL = "workspace:";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * Builds the ephemeral version for a publish run: the package's major.minor
 * with the workflow run number as the patch.
 */
export function nextVersion(baseVersion, runNumber) {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(baseVersion);

  if (match === null) {
    throw new Error(`Invalid package version: ${baseVersion}`);
  }

  const run = Number(runNumber);

  if (!Number.isInteger(run) || run < 0) {
    throw new Error(`Invalid run number: ${runNumber}`);
  }

  return `${match[1]}.${match[2]}.${run}`;
}

/**
 * Rewrites a manifest for publishing: internal workspace dependencies are
 * pinned to the ephemeral version, workspace dependencies on private packages
 * are dropped (npm does not understand the workspace protocol).
 */
export function rewriteWorkspaceDeps(manifest, version) {
  const rewritten = structuredClone(manifest);
  rewritten.version = version;

  for (const field of DEPENDENCY_FIELDS) {
    const deps = rewritten[field];

    if (deps === undefined) {
      continue;
    }

    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string" || !range.startsWith(WORKSPACE_PROTOCOL)) {
        continue;
      }

      if (PUBLIC_PACKAGE_NAMES.has(name)) {
        deps[name] = version;
      } else {
        delete deps[name];
      }
    }

    if (Object.keys(deps).length === 0) {
      delete rewritten[field];
    }
  }

  return rewritten;
}

export function readManifest(packageDir) {
  return JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8"),
  );
}

/**
 * Discovers every publishable (non-private) package under `packagesDir`,
 * returned in a safe dependency order.
 */
export function discoverPublicPackages(packagesDir) {
  const found = new Map();

  for (const entry of readdirSync(packagesDir)) {
    const dir = path.join(packagesDir, entry);

    if (!statSync(dir).isDirectory()) {
      continue;
    }

    let manifest;
    try {
      manifest = readManifest(dir);
    } catch {
      continue;
    }

    if (manifest.private !== true && manifest.name !== undefined) {
      found.set(manifest.name, { name: manifest.name, dir });
    }
  }

  const ordered = [];

  for (const name of PUBLISH_ORDER) {
    const pkg = found.get(name);

    if (pkg === undefined) {
      throw new Error(`Publishable package not found: ${name}`);
    }

    ordered.push(pkg);
    found.delete(name);
  }

  if (found.size > 0) {
    const extra = [...found.keys()].join(", ");
    throw new Error(`Unexpected publishable packages: ${extra}`);
  }

  return ordered;
}
