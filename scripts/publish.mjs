#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverPublicPackages,
  nextVersion,
  readManifest,
  rewriteWorkspaceDeps,
} from "./version.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseArgs(argv) {
  let dryRun = false;
  let runNumber = process.env.GITHUB_RUN_NUMBER;
  let registry;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--run=")) {
      runNumber = arg.slice("--run=".length);
      continue;
    }

    if (arg.startsWith("--registry=")) {
      registry = arg.slice("--registry=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (runNumber === undefined || runNumber === "") {
    throw new Error(
      "Missing run number. Set GITHUB_RUN_NUMBER or pass --run=<number>.",
    );
  }

  const run = Number(runNumber);

  if (!Number.isInteger(run) || run <= 0) {
    throw new Error(`Invalid run number: ${runNumber}`);
  }

  return { dryRun, run, registry };
}

function npmArgs(args, registry) {
  if (registry === undefined) {
    return args;
  }

  return [...args, `--registry=${registry}`];
}

function isPublished(name, version, registry) {
  try {
    const output = execFileSync(
      "npm",
      npmArgs(["view", `${name}@${version}`, "version"], registry),
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );

    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function main() {
  const { dryRun, run, registry } = parseArgs(process.argv.slice(2));
  const packages = discoverPublicPackages(path.join(ROOT, "packages"));

  console.log(
    `${dryRun ? "[dry-run] " : ""}Publishing ${packages.length} packages for run ${run}`,
  );

  const originals = new Map();

  for (const pkg of packages) {
    const manifestPath = path.join(pkg.dir, "package.json");
    const original = readFileSync(manifestPath, "utf8");
    originals.set(manifestPath, original);

    const manifest = readManifest(pkg.dir);
    const version = nextVersion(manifest.version, run);

    if (isPublished(pkg.name, version, registry)) {
      console.log(`- skip ${pkg.name}@${version} (already published)`);
      continue;
    }

    const rewritten = rewriteWorkspaceDeps(manifest, version);

    if (dryRun) {
      console.log(`- would publish ${pkg.name}@${version}`);
      continue;
    }

    console.log(`- publish ${pkg.name}@${version}`);
    writeFileSync(manifestPath, `${JSON.stringify(rewritten, null, 2)}\n`);

    try {
      execFileSync(
        "npm",
        npmArgs(["publish", "--access", "public"], registry),
        {
          cwd: pkg.dir,
          stdio: "inherit",
        },
      );
    } finally {
      writeFileSync(manifestPath, original);
    }
  }

  for (const [manifestPath, original] of originals) {
    writeFileSync(manifestPath, original);
  }

  console.log(`${dryRun ? "[dry-run] " : ""}Done.`);
}

main();
