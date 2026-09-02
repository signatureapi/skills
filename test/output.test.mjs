import { test } from "node:test";
import assert from "node:assert/strict";
import { gap, requireTestKey, resolveKey } from "../lib/output.mjs";

test("requireTestKey returns a test key unchanged", () => {
  assert.equal(requireTestKey("key_test_abc"), "key_test_abc");
});

test("requireTestKey exits on a live key, with no way to bypass it", () => {
  const exit = process.exit;
  const log = console.log;
  let code = null;
  let printed = "";
  process.exit = (c) => { code = c; throw new Error("exited"); };
  console.log = (s) => { printed = s; };
  try {
    assert.throws(() => requireTestKey("key_live_abc"));
  } finally {
    process.exit = exit;
    console.log = log;
  }
  assert.equal(code, 1);
  assert.equal(JSON.parse(printed).code, "LIVE_KEY_REFUSED");
});

test("requireTestKey has no parameter that can let a live key through", () => {
  assert.equal(requireTestKey.length, 1);
});

test("resolveKey accepts a test key and reports mode test", () => {
  assert.deepEqual(resolveKey("key_test_abc"), { key: "key_test_abc", mode: "test" });
});

test("resolveKey accepts a live key and reports mode live", () => {
  assert.deepEqual(resolveKey("key_live_abc"), { key: "key_live_abc", mode: "live" });
});

test("resolveKey exits when no key is set", () => {
  const exit = process.exit;
  const log = console.log;
  let code = null;
  let printed = "";
  process.exit = (c) => { code = c; throw new Error("exited"); };
  console.log = (s) => { printed = s; };
  try {
    assert.throws(() => resolveKey(undefined));
  } finally {
    process.exit = exit;
    console.log = log;
  }
  assert.equal(code, 1);
  assert.equal(JSON.parse(printed).code, "MISSING_API_KEY");
});

test("gap records the operation, the fallback and where to report it", () => {
  const g = gap("read webhook deliveries", "none", "No delivery log exists on any surface.");
  assert.equal(g.gap, true);
  assert.equal(g.operation, "read webhook deliveries");
  assert.match(g.report_to, /github\.com\/signatureapi\/skills/);
});
