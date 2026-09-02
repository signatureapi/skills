import { test } from "node:test";
import assert from "node:assert/strict";
import { gap, requireTestKey } from "../lib/output.mjs";

test("requireTestKey returns a test key unchanged", () => {
  assert.equal(requireTestKey("key_test_abc", false), "key_test_abc");
});

test("requireTestKey exits on a live key without --allow-live", () => {
  const exit = process.exit;
  const log = console.log;
  let code = null;
  let printed = "";
  process.exit = (c) => { code = c; throw new Error("exited"); };
  console.log = (s) => { printed = s; };
  try {
    assert.throws(() => requireTestKey("key_live_abc", false));
  } finally {
    process.exit = exit;
    console.log = log;
  }
  assert.equal(code, 1);
  assert.equal(JSON.parse(printed).code, "LIVE_KEY_REFUSED");
});

test("requireTestKey allows a live key when explicitly permitted", () => {
  assert.equal(requireTestKey("key_live_abc", true), "key_live_abc");
});

test("gap records the operation, the fallback and where to report it", () => {
  const g = gap("read webhook deliveries", "none", "No delivery log exists on any surface.");
  assert.equal(g.gap, true);
  assert.equal(g.operation, "read webhook deliveries");
  assert.match(g.report_to, /github\.com\/signatureapi\/skills/);
});
