import assert from "node:assert/strict";
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
    "src/a.ts(1,2): error TS1234: first",
    "src/b.ts(3,4): error TS5678: second",
  ]);
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
