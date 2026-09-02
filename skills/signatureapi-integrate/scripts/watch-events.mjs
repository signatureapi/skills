#!/usr/bin/env node
// Part of the SignatureAPI signatureapi-integrate skill. Polls a test-mode
// envelope's events until it reaches a terminal status, to confirm a
// ceremony actually completed. Test-mode tooling, not production code.
// Full workflow: SKILL.md.
import { ok, fail, gap, requireTestKey } from "./lib/output.mjs";

const API = process.env.SIGNATUREAPI_BASE_URL ?? "https://api.signatureapi.com/v1";

export function isTerminal(status) {
  return ["completed", "failed", "canceled"].includes(status);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = requireTestKey(process.env.SIGNATUREAPI_KEY);
  const envelopeId = arg("envelope");
  if (!envelopeId) {
    fail("MISSING_ENVELOPE_ID", "Pass --envelope <id>.", [
      "node scripts/watch-events.mjs --envelope env_...",
    ]);
  }
  const timeoutMs = Number(arg("timeout", "300")) * 1000;
  const started = Date.now();
  const seen = [];

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${API}/envelopes/${envelopeId}/events`, { headers: { "X-API-Key": key } });
    if (!res.ok) {
      fail("EVENTS_FETCH_FAILED", `HTTP ${res.status} reading events.`, ["node scripts/check-setup.mjs"]);
    }
    const { data = [] } = await res.json();
    for (const event of data) {
      if (!seen.some((e) => e.id === event.id)) seen.push(event);
    }
    const envelope = await fetch(`${API}/envelopes/${envelopeId}`, { headers: { "X-API-Key": key } })
      .then((r) => r.json())
      .catch(() => ({}));
    if (isTerminal(envelope.status)) {
      ok({
        envelope_id: envelopeId,
        status: envelope.status,
        events: seen.map((e) => e.type),
        mcp_gap: gap(
          "read envelope events",
          "REST GET /envelopes/{id}/events",
          "MCP exposes no events tool, so event confirmation cannot be done through MCP.",
        ),
      });
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  fail("WATCH_TIMED_OUT", `Envelope ${envelopeId} did not reach a terminal status in time.`, [
    `curl -sS -H "X-API-Key: $SIGNATUREAPI_KEY" ${API}/envelopes/${envelopeId}`,
    "MCP: get_envelope to inspect recipient status",
  ]);
}
