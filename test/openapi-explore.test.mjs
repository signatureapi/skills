import { test } from "node:test";
import assert from "node:assert/strict";
import { listWebhooks, selectSchema } from "../skills/signatureapi-integrate/scripts/openapi-explore.mjs";

const spec = {
  components: { schemas: { Envelope: { type: "object", properties: { title: { type: "string" } } } } },
  webhooks: {
    "envelope.completed": {
      post: { summary: "Envelope completed", requestBody: { content: { "application/json": { schema: { type: "object" } } } } },
    },
    "recipient.sent": { post: { summary: "Recipient sent" } },
  },
};

test("listWebhooks returns every event type with its payload schema, filtered by substring", () => {
  const all = listWebhooks(spec);
  assert.deepEqual(
    all.map((e) => e.type),
    ["envelope.completed", "recipient.sent"],
  );
  assert.deepEqual(all[0].payload, { type: "object" });
  assert.equal(all[1].payload, null);
  assert.deepEqual(
    listWebhooks(spec, "RECIPIENT").map((e) => e.type),
    ["recipient.sent"],
  );
  assert.deepEqual(listWebhooks({}, undefined), []);
});

test("selectSchema finds a schema by exact name", () => {
  assert.deepEqual(selectSchema(spec, "Envelope"), spec.components.schemas.Envelope);
});

test("selectSchema is case-insensitive and returns null when absent", () => {
  assert.deepEqual(selectSchema(spec, "envelope"), spec.components.schemas.Envelope);
  assert.equal(selectSchema(spec, "Nope"), null);
});
