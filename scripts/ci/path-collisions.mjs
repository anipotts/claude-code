#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { caseFold } from "unicode-case-folding";

const root = fileURLToPath(new URL("../..", import.meta.url));

export function foldPath(path) {
  return caseFold(path.normalize("NFD")).normalize("NFD");
}

export function findPathCollisions(paths) {
  const seen = new Map();
  const collisions = [];
  for (const path of paths) {
    const folded = foldPath(path);
    const prior = seen.get(folded);
    if (prior && prior !== path) collisions.push([prior, path]);
    else seen.set(folded, path);
  }
  return collisions;
}

function main() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.signal ?? result.status}`);
  }
  const paths = result.stdout.split("\0").filter(Boolean);
  const collisions = findPathCollisions(paths);
  if (collisions.length > 0) {
    console.error("case- or normalization-colliding tracked paths:");
    for (const [left, right] of collisions) console.error(`  ${left}\n  ${right}`);
    process.exitCode = 1;
  } else {
    console.log(`checked ${paths.length} tracked paths: no collisions`);
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
