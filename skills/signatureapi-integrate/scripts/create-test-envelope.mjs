#!/usr/bin/env node
// Part of the SignatureAPI signatureapi-integrate skill. Prints (--dry-run)
// or creates a minimum viable test-mode envelope, for adapting into your
// own create_envelope call. Test-mode tooling, not production code. Full
// workflow: SKILL.md.
import { ok, fail, requireTestKey } from "./lib/output.mjs";

const API = process.env.SIGNATUREAPI_BASE_URL ?? "https://api.signatureapi.com/v1";

export function buildEnvelope({ title, documentUrl, recipientName, recipientEmail, auth = "custom" }) {
  const recipient = { type: "signer", key: "signer", name: recipientName, email: recipientEmail };
  if (auth === "email_code") {
    recipient.ceremony = { authentication: [{ type: "email_code" }] };
  } else if (auth === "custom") {
    recipient.ceremony = {
      authentication: [
        {
          type: "custom",
          provider: "No identity verification performed",
          data: {
            Warning:
              "Test-mode envelope created by the signatureapi-integrate skill to verify an integration end to end. No recipient identity check was performed.",
          },
        },
      ],
    };
  }
  return {
    title,
    documents: [
      {
        format: "pdf",
        url: documentUrl,
        places: [{ key: "signer_signature", type: "signature", recipient_key: "signer" }],
      },
    ],
    recipients: [recipient],
  };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = requireTestKey(process.env.SIGNATUREAPI_KEY);
  const documentUrl = arg("document-url");
  if (!documentUrl) {
    fail("MISSING_DOCUMENT_URL", "A publicly reachable PDF URL is required.", [
      "Call the MCP tool mint_upload_url to upload a local PDF and get a URL",
      "node scripts/create-test-envelope.mjs --document-url https://example.com/agreement.pdf",
    ]);
  }
  const auth = arg("auth", "custom");
  if (auth !== "custom" && auth !== "email_code" && auth !== "email_link") {
    fail("INVALID_AUTH", `--auth must be "custom", "email_code", or "email_link", got "${auth}".`, [
      "node scripts/create-test-envelope.mjs --document-url <url> --auth email_link",
    ]);
  }
  const body = buildEnvelope({
    title: arg("title", "Test agreement"),
    documentUrl,
    recipientName: arg("recipient-name", "Test Signer"),
    recipientEmail: arg("recipient-email", "test-signer@example.com"),
    auth,
  });

  if (process.argv.includes("--dry-run")) {
    ok({ dry_run: true, body });
  }

  const res = await fetch(`${API}/envelopes`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);

  if (res.status === 422) {
    fail("ENVELOPE_VALIDATION_FAILED", payload?.detail ?? "The envelope body was rejected.", [
      "node scripts/openapi-explore.mjs schema Envelope",
      "Check that every place's recipient_key matches a recipient key",
    ]);
  }
  if (!res.ok) {
    fail("ENVELOPE_CREATE_FAILED", `HTTP ${res.status}: ${payload?.detail ?? "unknown error"}`, [
      "node scripts/check-setup.mjs",
    ]);
  }

  const ceremonyUrl = payload.recipients?.[0]?.ceremony?.url ?? null;

  ok({
    envelope_id: payload.id,
    status: payload.status,
    ceremony_url: ceremonyUrl,
    next: ceremonyUrl
      ? [`node scripts/watch-events.mjs --envelope ${payload.id}`]
      : [
          "ceremony_url is null (expected for --auth email_link) — read it from the email instead:",
          "MCP: list_emails with envelope_id to find the request email, then get_email for ceremony_url",
          `node scripts/watch-events.mjs --envelope ${payload.id}`,
        ],
  });
}
