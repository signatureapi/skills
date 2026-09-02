import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope } from "../skills/engineering/integrate-signatures/scripts/create-test-envelope.mjs";

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
