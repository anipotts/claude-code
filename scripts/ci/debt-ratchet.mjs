#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../..", import.meta.url));
const baselinePath = fileURLToPath(new URL("./debt-baseline.json", import.meta.url));

export function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll(root, "<root>")
    .replace(/\x1b\[[0-9;]*m/g, "");
}

export function parseTypecheck(output) {
  return normalize(output)
    .split("\n")
    .filter((line) => /^(?:<root>\/)?[^\s].*\(\d+,\d+\): error TS\d+:/.test(line))
    .map((line) => line.replace(/\(\d+,\d+\)(?=: error TS\d+:)/, ""));
}

export function parseBiome(output) {
  return normalize(output)
    .split("\n")
    .filter((line) => /^::(?:error|warning|notice) /.test(line))
    .map((line) =>
      line.replace(/,(?:line|endLine|col|endColumn)=\d+/g, ""),
    );
}

export function parseAudit(output) {
  const report = JSON.parse(output);
  return Object.entries(report).flatMap(([packageName, advisories]) =>
    advisories.map(({ id, severity }) => `${packageName}:${id}:${severity}`),
  );
}

export function compareFingerprints(name, currentValues, baselineHashes) {
  const valuesByHash = new Map(currentValues.map((value) => [fingerprint(value), value]));
  const currentHashes = currentValues.map(fingerprint).sort();
  const available = new Map();
  for (const hash of baselineHashes) available.set(hash, (available.get(hash) ?? 0) + 1);
  const added = [];
  for (const hash of currentHashes) {
    const remaining = available.get(hash) ?? 0;
    if (remaining > 0) available.set(hash, remaining - 1);
    else added.push(hash);
  }
  return {
    name,
    currentHashes,
    baselineCount: baselineHashes.length,
    added,
    addedValues: added.map((hash) => valuesByHash.get(hash)),
    removedCount: [...available.values()].reduce((total, count) => total + count, 0),
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    signal: result.signal,
  };
}

export function assertAnalyzerResult(name, result, diagnosticCount, allowedStatuses) {
  if (result.signal) throw new Error(`${name} terminated by signal ${result.signal}`);
  if (result.status === null || !allowedStatuses.includes(result.status)) {
    throw new Error(`${name} exited with unexpected status ${result.status}`);
  }
  if (result.status !== 0 && diagnosticCount === 0) {
    throw new Error(`${name} failed without parseable diagnostics`);
  }
}

function collect() {
  const typecheck = run("bun", ["run", "typecheck"]);
  const biome = run("node_modules/.bin/biome", [
    "check",
    "src/",
    "--reporter=github",
    "--max-diagnostics=none",
  ]);
  const audit = run("bun", ["audit", "--json"]);

  const values = {
    typecheck: parseTypecheck(`${typecheck.stdout}\n${typecheck.stderr}`),
    biome: parseBiome(`${biome.stdout}\n${biome.stderr}`),
    audit: parseAudit(audit.stdout),
  };

  assertAnalyzerResult("typecheck", typecheck, values.typecheck.length, [0, 2]);
  assertAnalyzerResult("biome", biome, values.biome.length, [0, 1]);
  assertAnalyzerResult("audit", audit, values.audit.length, [0, 1]);
  return values;
}

function capture() {
  const values = collect();
  const baseline = {
    version: 1,
    note: "Known inherited debt. Entries are diagnostic fingerprints, not passing results.",
    generatedFrom: "3a854557e01eeda1009329d608cdbeb1deb7c45d",
    diagnostics: Object.fromEntries(
      Object.entries(values).map(([name, diagnostics]) => [
        name,
        diagnostics.map(fingerprint).sort(),
      ]),
    ),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  for (const [name, hashes] of Object.entries(baseline.diagnostics)) {
    console.log(`captured ${name}: ${hashes.length}`);
  }
}

function check() {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (baseline.version !== 1) throw new Error(`unsupported baseline version: ${baseline.version}`);

  const values = collect();
  const comparisons = Object.entries(values).map(([name, diagnostics]) =>
    compareFingerprints(name, diagnostics, baseline.diagnostics[name] ?? []),
  );

  let failed = false;
  for (const result of comparisons) {
    console.log(
      `${result.name}: ${result.currentHashes.length} current, ${result.baselineCount} inherited, ${result.removedCount} removed`,
    );
    if (result.added.length > 0) {
      failed = true;
      console.error(`${result.name}: ${result.added.length} new diagnostic fingerprint(s)`);
      for (const value of result.addedValues.slice(0, 20)) console.error(`  ${value}`);
    }
  }
  if (failed) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const mode = process.argv[2] ?? "check";
  if (mode === "capture") capture();
  else if (mode === "check") check();
  else throw new Error(`usage: debt-ratchet.mjs [capture|check]`);
}
