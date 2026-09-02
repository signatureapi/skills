const REPORT_TO = "https://github.com/signatureapi/skills/issues/new";

export function ok(data = {}) {
  console.log(JSON.stringify({ ok: true, ...data }, null, 2));
  process.exit(0);
}

export function fail(code, message, next = []) {
  console.log(JSON.stringify({ ok: false, code, message, next }, null, 2));
  process.exit(1);
}

export function gap(operation, fallback, detail) {
  return { gap: true, operation, fallback, detail, report_to: REPORT_TO };
}

export function requireTestKey(key, allowLive) {
  if (!key) {
    fail(
      "MISSING_API_KEY",
      "No API key found. Set SIGNATUREAPI_KEY to a test key (key_test_...).",
      ["export SIGNATUREAPI_KEY=key_test_...", "Get one at https://dashboard.signatureapi.com/api-keys"],
    );
  }
  if (key.startsWith("key_live_") && !allowLive) {
    fail(
      "LIVE_KEY_REFUSED",
      "This is a live key. Skill scripts run in test mode only; live envelopes are legally binding and email real people.",
      ["export SIGNATUREAPI_KEY=key_test_...", "Re-run with --allow-live only if you truly intend live mode"],
    );
  }
  return key;
}
