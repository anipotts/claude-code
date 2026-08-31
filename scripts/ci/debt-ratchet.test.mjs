import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareFingerprints,
  fingerprint,
  parseAudit,
  parseBiome,
  parseTypecheck,
} from "./debt-ratchet.mjs";

test("parses TypeScript diagnostics without continuation lines", () => {
  const output = [
    "src/a.ts(1,2): error TS1234: first",
    "  continuation",
    "src/b.ts(3,4): error TS5678: second",
  ].join("\n");
  assert.deepEqual(parseTypecheck(output), [
    "src/a.ts: error TS1234: first",
    "src/b.ts: error TS5678: second",
  ]);
});

test("diagnostic identity ignores volatile source positions", () => {
  const before = parseTypecheck("src/a.ts(1,2): error TS1234: first");
  const after = parseTypecheck("src/a.ts(90,18): error TS1234: first");
  assert.deepEqual(before, after);

  const biomeBefore = parseBiome(
    "::error title=lint/test,file=src/a.ts,line=1,endLine=1,col=2,endColumn=3::same",
  );
  const biomeAfter = parseBiome(
    "::error title=lint/test,file=src/a.ts,line=90,endLine=90,col=8,endColumn=9::same",
  );
  assert.deepEqual(biomeBefore, biomeAfter);
});

test("parses compact Biome diagnostics", () => {
  const output = [
    "::error title=format,file=src/a.ts,line=1::format issue",
    "noise",
    "::warning title=lint/test,file=src/b.ts,line=2::lint issue",
  ].join("\n");
  assert.equal(parseBiome(output).length, 2);
});

test("parses audit advisories by package, id, and severity", () => {
  const output = JSON.stringify({ pkg: [{ id: 42, severity: "high" }] });
  assert.deepEqual(parseAudit(output), ["pkg:42:high"]);
});

test("allows removed debt and rejects new diagnostic fingerprints", () => {
  const baseline = [fingerprint("known"), fingerprint("removed")].sort();
  const improved = compareFingerprints("test", ["known"], baseline);
  assert.equal(improved.added.length, 0);
  assert.equal(improved.removedCount, 1);

  const regressed = compareFingerprints("test", ["known", "new"], baseline);
  assert.deepEqual(regressed.added, [fingerprint("new")]);
});

test("ratchets repeated occurrences of the same diagnostic", () => {
  const baseline = [fingerprint("known")];
  const regressed = compareFingerprints("test", ["known", "known"], baseline);
  assert.equal(regressed.added.length, 1);
});

test("push diff check covers the complete event range", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(
    workflow,
    /git diff --check "\$\{\{ github\.event\.before \}\}\.\.\$\{\{ github\.sha \}\}"/,
  );
});
