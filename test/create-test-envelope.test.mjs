import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope, parseAuth } from "../skills/signatureapi-integrate/scripts/create-test-envelope.mjs";

test("buildEnvelope defaults to custom authentication", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
  });
  assert.equal(body.documents[0].format, "pdf");
  assert.equal(body.documents[0].places[0].type, "signature");
  assert.equal(body.documents[0].places[0].recipient_key, body.recipients[0].key);
  assert.equal(body.recipients[0].type, "signer");
  const [authentication] = body.recipients[0].ceremony.authentication;
  assert.equal(authentication.type, "custom");
  assert.equal(typeof authentication.provider, "string");
  assert.ok(authentication.provider.length > 0);
  assert.equal(typeof authentication.data, "object");
  assert.ok(Object.keys(authentication.data).length >= 1);
});

test("buildEnvelope's default custom authentication reads as no identity check was performed", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
  });
  const [authentication] = body.recipients[0].ceremony.authentication;
  // The audit log only ever shows provider/data in isolation, with no
  // surrounding documentation — both must read as a plain denial of identity
  // verification, not as a claim that one occurred.
  assert.match(authentication.provider, /no identity verification performed/i);
  const dataText = Object.values(authentication.data).join(" ");
  assert.match(dataText, /no recipient identity check was performed/i);
});

test("buildEnvelope with --auth email_link omits the ceremony object (the API default)", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
    auth: "email_link",
  });
  assert.deepEqual(Object.keys(body).sort(), ["documents", "recipients", "title"]);
  assert.equal("ceremony" in body.recipients[0], false);
});

test("buildEnvelope with --auth email_code produces the ceremony authentication object", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
    auth: "email_code",
  });
  assert.deepEqual(body.recipients[0].ceremony, { authentication: [{ type: "email_code" }] });
});

test("buildEnvelope with --auth email_link,email_code produces an ordered two-method array", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
    auth: "email_link,email_code",
  });
  assert.deepEqual(body.recipients[0].ceremony, {
    authentication: [{ type: "email_link" }, { type: "email_code" }],
  });
});

test("buildEnvelope keeps the custom audit fields when a challenge follows custom", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
    auth: "custom,email_code",
  });
  const [main, challenge] = body.recipients[0].ceremony.authentication;
  assert.equal(main.type, "custom");
  assert.match(main.provider, /no identity verification performed/i);
  assert.deepEqual(challenge, { type: "email_code" });
});

test("parseAuth accepts a single method and a comma-separated list", () => {
  assert.deepEqual(parseAuth("custom").types, ["custom"]);
  assert.deepEqual(parseAuth("email_link, email_code").types, ["email_link", "email_code"]);
});

test("parseAuth enforces the API's ordering rules", () => {
  assert.match(parseAuth("email_code,email_link").error, /only be the first/);
  assert.match(parseAuth("email_code,custom").error, /only be the first/);
  assert.match(parseAuth("email_code,email_code").error, /at most once/);
  assert.match(parseAuth("email_link,custom").error, /only be the first/);
  assert.match(parseAuth("email-link").error, /--auth accepts/);
  assert.match(parseAuth("").error, /cannot be empty/);
});
