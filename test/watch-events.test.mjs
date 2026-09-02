import { test } from "node:test";
import assert from "node:assert/strict";
import { isTerminal, hasFlag } from "../skills/signatureapi-integrate/scripts/watch-events.mjs";

test("terminal statuses are completed, failed and canceled", () => {
  assert.equal(isTerminal("completed"), true);
  assert.equal(isTerminal("failed"), true);
  assert.equal(isTerminal("canceled"), true);
  assert.equal(isTerminal("in_progress"), false);
  assert.equal(isTerminal("processing"), false);
});

test("hasFlag detects --once regardless of other args", () => {
  assert.equal(hasFlag("once", ["node", "watch-events.mjs", "--envelope", "env_1", "--once"]), true);
  assert.equal(hasFlag("once", ["node", "watch-events.mjs", "--envelope", "env_1"]), false);
});
