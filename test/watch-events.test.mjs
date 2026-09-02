import { test } from "node:test";
import assert from "node:assert/strict";
import { isTerminal } from "../skills/signatureapi-integrate/scripts/watch-events.mjs";

test("terminal statuses are completed, failed and canceled", () => {
  assert.equal(isTerminal("completed"), true);
  assert.equal(isTerminal("failed"), true);
  assert.equal(isTerminal("canceled"), true);
  assert.equal(isTerminal("in_progress"), false);
  assert.equal(isTerminal("processing"), false);
});
