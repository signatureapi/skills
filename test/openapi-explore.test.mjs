import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSchema } from "../skills/integrate-signatures/scripts/openapi-explore.mjs";

const spec = {
  components: { schemas: { Envelope: { type: "object", properties: { title: { type: "string" } } } } },
};

test("selectSchema finds a schema by exact name", () => {
  assert.deepEqual(selectSchema(spec, "Envelope"), spec.components.schemas.Envelope);
});

test("selectSchema is case-insensitive and returns null when absent", () => {
  assert.deepEqual(selectSchema(spec, "envelope"), spec.components.schemas.Envelope);
  assert.equal(selectSchema(spec, "Nope"), null);
});
