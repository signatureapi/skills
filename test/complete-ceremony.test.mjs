import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectCeremonyUrls,
  extractCeremonyId,
  checkSuppliedUrlAgainstEnvelope,
  pollForRecipientCompletion,
} from "../skills/signatureapi-integrate/scripts/complete-ceremony.mjs";

/** A ceremony URL shaped like the real ones: a JWT `token` query param whose
 * payload carries `ceremony_id`. Header/signature content doesn't matter for
 * these tests — only the payload segment is read. */
function ceremonyUrl(ceremonyId, { origin = "https://sign.signatureapi.dev", iat = Date.now() } = {}) {
  const payload = Buffer.from(JSON.stringify({ ceremony_id: ceremonyId, iat })).toString("base64url");
  return `${origin}/en/start?token=header.${payload}.signature`;
}

const ceremonyIdA = "ce_aaaaaaaaaaaaaaaaaaaaaa";
const ceremonyIdB = "ce_bbbbbbbbbbbbbbbbbbbbbb";

const envelopeWithUrl = {
  recipients: [{ key: "signer", ceremony: { url: ceremonyUrl(ceremonyIdA, { iat: 1 }) } }],
};

const envelopeWithNoUrls = {
  recipients: [{ key: "signer", ceremony: { url: null } }],
};

const envelopeWithTwoRecipients = {
  recipients: [
    { key: "a", ceremony: { url: ceremonyUrl(ceremonyIdA, { iat: 1 }) } },
    { key: "b", ceremony: { url: null } },
  ],
};

test("extractCeremonyId reads the ceremony_id claim out of the token query param", () => {
  assert.equal(extractCeremonyId(ceremonyUrl(ceremonyIdA)), ceremonyIdA);
});

test("extractCeremonyId returns null for a url with no parseable token", () => {
  assert.equal(extractCeremonyId("https://sign.signatureapi.dev/en/start"), null);
  assert.equal(extractCeremonyId("not a url"), null);
});

test("collectCeremonyUrls returns every non-null ceremony url", () => {
  assert.deepEqual(collectCeremonyUrls(envelopeWithUrl), [envelopeWithUrl.recipients[0].ceremony.url]);
  assert.deepEqual(collectCeremonyUrls(envelopeWithNoUrls), []);
});

test("collectCeremonyUrls scopes to a recipient key when given", () => {
  assert.deepEqual(collectCeremonyUrls(envelopeWithTwoRecipients, "a"), [envelopeWithTwoRecipients.recipients[0].ceremony.url]);
  assert.deepEqual(collectCeremonyUrls(envelopeWithTwoRecipients, "b"), []);
});

test("checkSuppliedUrlAgainstEnvelope passes when the ceremony_id matches, even though the token string differs (re-minted on every fetch)", () => {
  // Same ceremony_id as envelopeWithUrl, but a freshly-minted token (different
  // iat, different signature bytes) — this reproduces what a real second
  // fetch of the same untouched envelope returns.
  const freshlyFetchedUrl = ceremonyUrl(ceremonyIdA, { iat: 999999 });
  assert.notEqual(freshlyFetchedUrl, envelopeWithUrl.recipients[0].ceremony.url);
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithUrl, freshlyFetchedUrl, undefined);
  assert.deepEqual(result, { ok: true });
});

test("checkSuppliedUrlAgainstEnvelope fails URL_ENVELOPE_MISMATCH for a different ceremony_id", () => {
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithUrl, ceremonyUrl(ceremonyIdB), undefined);
  assert.equal(result.ok, false);
  assert.equal(result.code, "URL_ENVELOPE_MISMATCH");
});

test("checkSuppliedUrlAgainstEnvelope fails URL_ENVELOPE_MISMATCH for the right ceremony_id on the wrong origin", () => {
  const spoofed = ceremonyUrl(ceremonyIdA, { origin: "https://evil.example.com" });
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithUrl, spoofed, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.code, "URL_ENVELOPE_MISMATCH");
});

test("checkSuppliedUrlAgainstEnvelope fails EMAIL_LINK_URL_UNVERIFIABLE when the envelope has no ceremony urls, with no flag able to excuse it", () => {
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithNoUrls, ceremonyUrl(ceremonyIdA), undefined);
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMAIL_LINK_URL_UNVERIFIABLE");
});

test("checkSuppliedUrlAgainstEnvelope has no parameter that can let an unverifiable url through", () => {
  assert.equal(checkSuppliedUrlAgainstEnvelope.length, 3);
});

// I1: pollForRecipientCompletion used to default to recipients[0] whenever
// recipientKey was falsy — reachable when the ceremony URL's ceremony_id
// claim couldn't be parsed — which on a multi-recipient envelope could
// verify a recipient who was already `completed` before this walk started,
// reporting `verified: true` for a walk that signed nothing. It must now
// refuse instead of guessing, without ever calling fetch to do so.
test("pollForRecipientCompletion refuses with a distinct code when recipientKey could not be resolved, without fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("pollForRecipientCompletion should not have called fetch");
  };
  try {
    const result = await pollForRecipientCompletion({
      api: "https://api.signatureapi.dev/v1",
      envelopeId: "env_123",
      recipientKey: null,
      key: "key_test_abc",
      timeoutMs: 50,
    });
    assert.equal(result.completed, false);
    assert.equal(result.code, "RECIPIENT_KEY_UNRESOLVED");
    assert.equal(result.recipient, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pollForRecipientCompletion still resolves a matching, explicitly-keyed recipient", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: "in_progress",
      recipients: [
        { key: "a", status: "completed" },
        { key: "b", status: "in_progress" },
      ],
    }),
  });
  try {
    const result = await pollForRecipientCompletion({
      api: "https://api.signatureapi.dev/v1",
      envelopeId: "env_123",
      recipientKey: "b",
      key: "key_test_abc",
      timeoutMs: 50,
      intervalMs: 10,
    });
    // Recipient "b" never reaches completed within the short timeout, so
    // this should time out rather than complete — and crucially it must
    // check "b", not silently succeed against "a" (recipients[0]), which
    // is already completed.
    assert.equal(result.completed, false);
    assert.notEqual(result.code, "RECIPIENT_KEY_UNRESOLVED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
