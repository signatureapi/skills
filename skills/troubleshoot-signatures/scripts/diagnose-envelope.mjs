#!/usr/bin/env node
import { ok, fail, requireTestKey } from "./lib/output.mjs";

const API = process.env.SIGNATUREAPI_BASE_URL ?? "https://api.signatureapi.com/v1";

export function verdict({ envelope, events, recipients }) {
  const types = events.map((e) => e.type);

  if (types.includes("recipient.hard_bounced") || types.includes("recipient.soft_bounced")) {
    return {
      code: "RECIPIENT_BOUNCED",
      message: "A recipient's email bounced, so they never received the signing request.",
      next: [
        "Check the recipient address for typos",
        "MCP: list_emails with the envelope id to read the bounce detail",
        "Replace the recipient: POST /recipients/{id}/replace",
      ],
    };
  }
  if (envelope.status === "processing") {
    return {
      code: "STUCK_PROCESSING",
      message: "The envelope is still preparing documents. Document URLs must be publicly reachable.",
      next: [
        "Confirm every document URL returns 200 to an anonymous request",
        "Confirm each file is a valid PDF or DOCX",
        "If it has been stuck for more than a few minutes, contact support@signatureapi.com",
      ],
    };
  }
  if (envelope.status === "failed") {
    return {
      code: "ENVELOPE_FAILED",
      message: "The envelope failed. The failure reason is on the envelope.",
      next: ["MCP: get_envelope to read the failure reason"],
    };
  }
  if (envelope.status === "completed" && !types.includes("deliverable.generated")) {
    return {
      code: "DELIVERABLE_MISSING",
      message: "The envelope completed but no deliverable.generated event exists yet.",
      next: [
        `curl -sS -H "X-API-Key: $SIGNATUREAPI_KEY" ${API}/envelopes/<id>/deliverables`,
        "If it stays missing, contact support@signatureapi.com with the envelope id",
      ],
    };
  }
  if (envelope.status === "completed") {
    return { code: "OK", message: "The envelope completed and a deliverable was generated.", next: [] };
  }
  return {
    code: "IN_PROGRESS",
    message: `The envelope is ${envelope.status}; recipients have not all completed.`,
    next: [
      "MCP: get_envelope to see which recipient is pending",
      "In test mode, use list_emails + get_email to reach the ceremony link yourself",
    ],
  };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = requireTestKey(process.env.SIGNATUREAPI_KEY, process.argv.includes("--allow-live"));
  const id = arg("envelope");
  if (!id) fail("MISSING_ENVELOPE_ID", "Pass --envelope <id>.", ["node diagnose-envelope.mjs --envelope env_..."]);

  const headers = { "X-API-Key": key };
  const [envelope, eventsRes] = await Promise.all([
    fetch(`${API}/envelopes/${id}`, { headers }).then((r) => r.json()),
    fetch(`${API}/envelopes/${id}/events`, { headers }).then((r) => r.json()),
  ]);
  if (!envelope?.id) {
    fail("ENVELOPE_NOT_FOUND", `No envelope ${id} for this key. Check you are in the right mode.`, [
      "Confirm the key's mode: test envelopes are invisible to a live key and vice versa",
    ]);
  }

  const events = eventsRes?.data ?? [];
  ok({
    envelope_id: id,
    status: envelope.status,
    events: events.map((e) => e.type),
    verdict: verdict({ envelope, events, recipients: envelope.recipients ?? [] }),
  });
}
