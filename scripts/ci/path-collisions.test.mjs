import assert from "node:assert/strict";
import test from "node:test";

import { findPathCollisions, foldPath } from "./path-collisions.mjs";

test("folds ASCII and non-ASCII case", () => {
  assert.equal(foldPath("Button.tsx"), foldPath("button.tsx"));
  assert.equal(foldPath("Ä.tsx"), foldPath("ä.tsx"));
  assert.equal(foldPath("straße.tsx"), foldPath("STRASSE.tsx"));
});

test("folds composed and decomposed Unicode paths", () => {
  assert.equal(foldPath("café.tsx"), foldPath("cafe\u0301.tsx"));
});

test("does not conflate dotless i with ASCII i", () => {
  assert.notEqual(foldPath("ı.tsx"), foldPath("i.tsx"));
  assert.deepEqual(findPathCollisions(["ı.tsx", "i.tsx"]), []);
});

test("reports colliding pairs without flagging distinct paths", () => {
  assert.deepEqual(findPathCollisions(["A.tsx", "a.tsx", "other.tsx"]), [
    ["A.tsx", "a.tsx"],
  ]);
});
