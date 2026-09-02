#!/usr/bin/env node
import { ok, fail, requireTestKey } from "./lib/output.mjs";

const API = process.env.SIGNATUREAPI_BASE_URL ?? "https://api.signatureapi.com/v1";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/**
 * A ceremony URL carries a fresh, re-signed JWT on every fetch (SignatureAPI
 * mints a new `iat`/`exp`/signature each time `GET /envelopes/{id}` is
 * called — confirmed on staging: two fetches of the same untouched envelope
 * a second apart return two different URLs). So the URL string itself is not
 * a stable identifier and cannot be compared byte-for-byte across two
 * separate reads. The `ceremony_id` claim inside the token IS stable across
 * fetches; extracting it is the only way to recognize "the same ceremony" in
 * two URLs obtained at different times, since a ceremony has no id field of
 * its own to resolve independently (no id field on Ceremony, no GET for it).
 */
export function extractCeremonyId(url) {
  try {
    const token = new URL(url).searchParams.get("token");
    if (!token) return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json);
    return typeof claims.ceremony_id === "string" ? claims.ceremony_id : null;
  } catch {
    return null;
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Every non-null ceremony URL on the envelope, optionally scoped to one recipient key. */
export function collectCeremonyUrls(envelope, recipientKey) {
  const recipients = envelope?.recipients ?? [];
  const candidates = recipientKey ? recipients.filter((r) => r.key === recipientKey) : recipients;
  return candidates.map((r) => r?.ceremony?.url).filter(Boolean);
}

/**
 * When both --envelope and --url are supplied, the envelope fetch alone only
 * proves the *id* is a visible test-mode envelope — it proves nothing about
 * the *URL* being driven. This ties the two together: the supplied URL must
 * belong to a ceremony this envelope actually returned. Matching is by
 * `ceremony_id` claim (see extractCeremonyId) plus origin, not literal URL
 * equality, because the URL string is re-minted on every fetch. The origin
 * check means a URL cannot pass by merely echoing a real ceremony_id from
 * some other host — the JWT's signature is still not verified here, so this
 * is not a cryptographic proof, but combined with the envelope fetch already
 * having proven test-mode visibility of the id, and the origin match ruling
 * out any host swap, it is the strongest check available without a
 * ceremony-resolution endpoint (which does not exist).
 */
export function checkSuppliedUrlAgainstEnvelope(envelope, suppliedUrl, recipientKey, allowLive) {
  const urls = collectCeremonyUrls(envelope, recipientKey);

  if (urls.length === 0) {
    if (allowLive) return { ok: true };
    return {
      ok: false,
      code: "EMAIL_LINK_URL_UNVERIFIABLE",
      message: "This envelope returns no ceremony.url on any recipient (email_link authentication does this by design), so the supplied --url cannot be checked against it — there is nothing to match it to.",
      next: [
        "Create the verification envelope with create-test-envelope.mjs's default custom authentication instead — its ceremony.url comes back on the envelope and can be verified",
        "Or, if you genuinely intend to walk a URL this envelope cannot vouch for, re-run with --allow-live",
      ],
    };
  }

  const suppliedId = extractCeremonyId(suppliedUrl);
  const suppliedOrigin = originOf(suppliedUrl);
  const matches = urls.some(
    (u) => suppliedId && extractCeremonyId(u) === suppliedId && originOf(u) === suppliedOrigin,
  );

  if (!matches) {
    return {
      ok: false,
      code: "URL_ENVELOPE_MISMATCH",
      message: "The supplied --url does not match any ceremony this envelope returned, so it cannot be proven to belong to it. --envelope proves the id is test-mode; it does not prove the URL is that envelope's.",
      next: [
        "Use a ceremony URL this envelope actually returned (recipients[].ceremony.url from create-test-envelope.mjs or get_envelope) — fetch it fresh, the URL is re-minted on every read but its ceremony stays the same one",
        "Or drop --envelope and re-run with --url <url> --allow-live if you intend to walk an unrelated URL",
      ],
    };
  }

  return { ok: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const allowLive = process.argv.includes("--allow-live");
  const key = requireTestKey(process.env.SIGNATUREAPI_KEY, allowLive);

  const escapeHatchUrl = arg("url");
  const envelopeId = arg("envelope");

  if (escapeHatchUrl && !envelopeId && !allowLive) {
    fail("URL_REQUIRES_ALLOW_LIVE", "A --url given without --envelope cannot be proven to be a test-mode ceremony. Pass --allow-live alongside --url to confirm you accept that risk, or pass --envelope <id> alongside --url so fetching the envelope with your test key proves test mode.", [
      "Prefer: node scripts/complete-ceremony.mjs --envelope <id> --url <ceremony url> --i-consent",
      "Or re-run with: --url <url> --allow-live --i-consent",
    ]);
  }

  if (!escapeHatchUrl && !envelopeId) {
    fail("MISSING_ENVELOPE_ID", "Pass --envelope <id> (preferred), --envelope <id> --url <ceremony url>, or --url <ceremony url> --allow-live.", [
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

  if (envelopeId) {
    // Fetching the envelope with the test key IS the mode gate: test and live
    // are separate namespaces, so a test key only ever sees a test envelope.
    // It proves the id is test-mode. It does NOT, by itself, prove that a
    // separately-supplied --url belongs to this envelope — see
    // checkSuppliedUrlAgainstEnvelope below for that check.
    const recipientKey = arg("recipient");
    const res = await fetch(`${API}/envelopes/${envelopeId}`, { headers: { "X-API-Key": key } });
    if (res.status === 404) {
      fail("ENVELOPE_NOT_VISIBLE_TO_THIS_KEY", `No envelope ${envelopeId} is visible to this key. Test and live are separate namespaces, so this is not a test-mode envelope for this key.`, [
        "Confirm the key's mode: it must be a key_test_... key",
        "Use the envelope id printed by create-test-envelope.mjs",
      ]);
    }
    const envelope = await res.json();

    if (url) {
      const check = checkSuppliedUrlAgainstEnvelope(envelope, url, recipientKey, allowLive);
      if (!check.ok) {
        fail(check.code, check.message, check.next);
      }
    } else {
      const recipients = envelope?.recipients ?? [];
      const candidates = recipientKey
        ? recipients.filter((r) => r.key === recipientKey)
        : recipients;
      const recipient = candidates.find((r) => r?.ceremony?.url);

      if (!recipient) {
        fail("CEREMONY_URL_NOT_RETURNED", "ceremony.url is null for this recipient. It is null for email_link authentication (the API default) since possession of the emailed link is the recipient's authentication — and this script cannot read the email log itself.", [
          "Read the link from the email log yourself: MCP list_emails --envelope <id>, then get_email, then re-run with --url",
          "Or recreate the envelope with create-test-envelope.mjs, whose default custom authentication returns ceremony.url directly",
        ]);
      }
      url = recipient.ceremony.url;
    }
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
}
