import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope } from "../skills/integrate-signatures/scripts/create-test-envelope.mjs";

test("buildEnvelope defaults to email_code authentication", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
  });
  assert.deepEqual(Object.keys(body).sort(), ["documents", "recipients", "title"]);
  assert.equal(body.documents[0].format, "pdf");
  assert.equal(body.documents[0].places[0].type, "signature");
  assert.equal(body.documents[0].places[0].recipient_key, body.recipients[0].key);
  assert.equal(body.recipients[0].type, "signer");
  assert.deepEqual(body.recipients[0].ceremony, { authentication: [{ type: "email_code" }] });
});

test("buildEnvelope with --auth email_link omits the ceremony object", () => {
  const body = buildEnvelope({
    title: "Test agreement",
    documentUrl: "https://example.com/a.pdf",
    recipientName: "Jane Doe",
    recipientEmail: "jane@example.com",
    auth: "email_link",
  });
  assert.equal("ceremony" in body.recipients[0], false);
});
