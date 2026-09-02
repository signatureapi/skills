import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "../skills/troubleshoot-signatures/scripts/diagnose-envelope.mjs";

test("an envelope stuck in processing is diagnosed as document preparation", () => {
  const v = verdict({ envelope: { status: "processing" }, events: [], recipients: [] });
  assert.equal(v.code, "STUCK_PROCESSING");
  assert.ok(v.next.length > 0);
});

test("a completed envelope with no deliverable event is flagged", () => {
  const v = verdict({
    envelope: { status: "completed" },
    events: [{ type: "envelope.completed" }],
    recipients: [],
  });
  assert.equal(v.code, "DELIVERABLE_MISSING");
});

test("a healthy completed envelope reports no problem", () => {
  const v = verdict({
    envelope: { status: "completed" },
    events: [{ type: "envelope.completed" }, { type: "deliverable.generated" }],
    recipients: [],
  });
  assert.equal(v.code, "OK");
});

test("a bounced recipient outranks a merely in-progress envelope", () => {
  const v = verdict({
    envelope: { status: "in_progress" },
    events: [{ type: "recipient.hard_bounced" }],
    recipients: [{ email: "nope@example.com", status: "failed" }],
  });
  assert.equal(v.code, "RECIPIENT_BOUNCED");
});
