#!/usr/bin/env node
import { ok, fail, requireTestKey } from "./lib/output.mjs";

const API = process.env.SIGNATUREAPI_BASE_URL ?? "https://api.signatureapi.com/v1";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const key = requireTestKey(process.env.SIGNATUREAPI_KEY, process.argv.includes("--allow-live"));

const escapeHatchUrl = arg("url");
const envelopeId = arg("envelope");

if (escapeHatchUrl && !process.argv.includes("--allow-live")) {
  fail("URL_REQUIRES_ALLOW_LIVE", "An escape-hatch --url cannot be proven to be a test-mode ceremony. Pass --allow-live alongside --url to confirm you accept that risk, or use --envelope instead so the key itself proves test mode.", [
    "Prefer: node scripts/complete-ceremony.mjs --envelope <id> --i-consent",
    "Or re-run with: --url <url> --allow-live --i-consent",
  ]);
}

if (!escapeHatchUrl && !envelopeId) {
  fail("MISSING_ENVELOPE_ID", "Pass --envelope <id> (preferred) or --url <ceremony url> --allow-live.", [
    "node scripts/complete-ceremony.mjs --envelope <id> --i-consent",
  ]);
}

if (!process.argv.includes("--i-consent")) {
  fail("CONSENT_REQUIRED", "This drives a real browser through a signing ceremony. Test mode only, and only with the user's explicit consent.", [
    "Ask the user to confirm, then re-run with --i-consent",
    "Or use Branch A: hand the ceremony link to the user and wait",
  ]);
}

let url = escapeHatchUrl;

if (!url) {
  const recipientKey = arg("recipient");
  const res = await fetch(`${API}/envelopes/${envelopeId}`, { headers: { "X-API-Key": key } });
  if (res.status === 404) {
    fail("ENVELOPE_NOT_VISIBLE_TO_THIS_KEY", `No envelope ${envelopeId} is visible to this key. Test and live are separate namespaces, so this is not a test-mode envelope for this key.`, [
      "Confirm the key's mode: it must be a key_test_... key",
      "Use the envelope id printed by create-test-envelope.mjs",
    ]);
  }
  const envelope = await res.json();
  const recipients = envelope?.recipients ?? [];
  const candidates = recipientKey
    ? recipients.filter((r) => r.key === recipientKey)
    : recipients;
  const recipient = candidates.find((r) => r?.ceremony?.url);

  if (!recipient) {
    fail("CEREMONY_URL_NOT_RETURNED", "ceremony.url is null for this recipient. It is always null for email_link authentication, since possession of the emailed link is the recipient's authentication.", [
      'Create the recipient with "ceremony": {"authentication": [{"type": "email_code"}]} to have ceremony.url returned directly',
      "Or read the link from the email log: MCP list_emails --envelope <id>, then get_email",
    ]);
  }
  url = recipient.ceremony.url;
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  fail("PLAYWRIGHT_MISSING", "Playwright is not installed in this project.", [
    "npm install --save-dev playwright && npx playwright install chromium",
    "Or use Branch A instead (no browser needed)",
  ]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle" });

// Arm completion with genuine pointer movement (SIG-1211 organic-input gate).
for (let i = 0; i < 12; i++) {
  await page.mouse.move(100 + i * 40, 150 + i * 25, { steps: 4 });
}

try {
  await page.getByRole("button", { name: /start|begin|continue/i }).first().click({ timeout: 5000 });
} catch { /* some ceremonies open straight into the document */ }

await page.waitForTimeout(1000);

try {
  await page.getByRole("button", { name: /sign|approve|finish|complete|submit/i }).first().click({ timeout: 15000 });
} catch {
  await browser.close();
  fail("CEREMONY_ACTION_NOT_FOUND", "Could not find the primary ceremony action.", [
    "Re-run with PWDEBUG=1 to watch the browser",
    "Or use Branch A: hand the link to the user",
  ]);
}

// Fallback: if organic input was not detected, a consent modal appears instead
// of submitting. Confirming it is itself the deliberate act.
try {
  await page.getByRole("button", { name: /confirm|yes|continue/i }).first().click({ timeout: 4000 });
} catch { /* no modal — the click submitted directly */ }

await page.waitForTimeout(3000);
const finalUrl = page.url();
await browser.close();

ok({
  walked: true,
  final_url: finalUrl,
  next: ["node scripts/watch-events.mjs --envelope <envelope id>"],
});
