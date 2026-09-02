import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHost } from "../skills/signatureapi-integrate/scripts/webhook-receiver.mjs";

test("resolveHost defaults to 127.0.0.1, never the LAN-reachable 0.0.0.0 default", () => {
  assert.equal(resolveHost([]), "127.0.0.1");
});

test("resolveHost honors an explicit --host override", () => {
  assert.equal(resolveHost(["node", "webhook-receiver.mjs", "--host", "0.0.0.0"]), "0.0.0.0");
});
