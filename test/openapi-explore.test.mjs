import { test } from "node:test";
import assert from "node:assert/strict";
import * as explorer from "../skills/signatureapi-integrate/scripts/openapi-explore.mjs";

const { listWebhooks, selectSchema } = explorer;

const spec = {
  components: {
    schemas: { Envelope: { type: "object", properties: { title: { type: "string" } } } },
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        description: "Maximum number of deliverables to return.",
        schema: { type: "integer", minimum: 1, maximum: 20, default: 10 },
      },
    },
  },
  paths: {
    "/senders": {
      post: { operationId: "CreateSender", summary: "Create a sender", responses: { 201: {} } },
    },
    "/senders/{senderId}": {
      get: { operationId: "GetSender", summary: "Retrieve a sender", responses: { 200: {} } },
      delete: { operationId: "DeleteSender", summary: "Delete a sender", responses: { 204: {} } },
    },
    "/envelopes/{envelopeId}/deliverables": {
      parameters: [{ name: "envelopeId", in: "path", required: true, schema: { type: "string" } }],
      get: {
        operationId: "ListEnvelopeDeliverables",
        summary: "List deliverables",
        description: "Returns generated deliverables for one envelope.",
        parameters: [{ $ref: "#/components/parameters/Limit" }],
        responses: { 200: {}, "4XX": {}, "5XX": {} },
      },
    },
  },
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

test("listOperations returns method-aware operation cards filtered across names, paths and descriptions", () => {
  assert.equal(typeof explorer.listOperations, "function");
  assert.deepEqual(explorer.listOperations(spec, "sender"), [
    { name: "CreateSender", method: "POST", path: "/senders", summary: "Create a sender", description: null },
    {
      name: "GetSender",
      method: "GET",
      path: "/senders/{senderId}",
      summary: "Retrieve a sender",
      description: null,
    },
    {
      name: "DeleteSender",
      method: "DELETE",
      path: "/senders/{senderId}",
      summary: "Delete a sender",
      description: null,
    },
  ]);
  assert.deepEqual(
    explorer.listOperations(spec, "generated deliverables").map((operation) => operation.name),
    ["ListEnvelopeDeliverables"],
  );
});

test("inspectOperation reports an absent exact method and related operations without guessing capability", () => {
  assert.equal(typeof explorer.inspectOperation, "function");
  assert.deepEqual(explorer.inspectOperation(spec, "GET", "/senders"), {
    found: false,
    requested: "GET /senders",
    related: explorer.listOperations(spec, "senders"),
  });
});

test("inspectOperation resolves shared parameters and preserves query constraints", () => {
  const result = explorer.inspectOperation(spec, "get", "/envelopes/{envelopeId}/deliverables");
  assert.equal(result.found, true);
  assert.equal(result.operation.name, "ListEnvelopeDeliverables");
  assert.deepEqual(result.operation.parameters, [
    {
      name: "envelopeId",
      in: "path",
      required: true,
      description: null,
      type: "string",
      format: null,
      default: null,
      enum: null,
      minimum: null,
      maximum: null,
    },
    {
      name: "limit",
      in: "query",
      required: false,
      description: "Maximum number of deliverables to return.",
      type: "integer",
      format: null,
      default: 10,
      enum: null,
      minimum: 1,
      maximum: 20,
    },
  ]);
});

test("renderOperationMarkdown leads with a local finding and says no API request was sent", () => {
  assert.equal(typeof explorer.renderOperationMarkdown, "function");
  const markdown = explorer.renderOperationMarkdown(explorer.inspectOperation(spec, "GET", "/senders"));
  assert.match(markdown, /^# Local contract inspection: operation not found/);
  assert.match(markdown, /No API request was sent\./);
  assert.match(markdown, /`GET \/senders` is not defined/);
  assert.match(markdown, /`POST \/senders`/);
  assert.doesNotMatch(markdown, /OPERATION_NOT_FOUND/);
});

test("checkRequest matches a concrete path to its OpenAPI template", () => {
  assert.equal(typeof explorer.checkRequest, "function");
  const result = explorer.checkRequest(spec, "GET", "/envelopes/env_example/deliverables?limit=20");
  assert.equal(result.ok, true);
  assert.equal(result.request_sent, false);
  assert.equal(result.operation.name, "ListEnvelopeDeliverables");
  assert.equal(result.operation.path, "/envelopes/{envelopeId}/deliverables");
  assert.deepEqual(result.problems, []);
});

test("checkRequest rejects an absent method and returns related method-aware operations", () => {
  const result = explorer.checkRequest(spec, "GET", "/senders?limit=10");
  assert.equal(result.ok, false);
  assert.equal(result.request_sent, false);
  assert.equal(result.operation, null);
  assert.deepEqual(
    result.related.map(({ method, path }) => `${method} ${path}`),
    ["POST /senders"],
  );
  assert.match(result.problems[0].message, /GET \/senders/);
});

test("checkRequest validates unknown parameters, numeric bounds and enums", () => {
  const enumSpec = structuredClone(spec);
  enumSpec.paths["/envelopes/{envelopeId}/deliverables"].get.parameters.push({
    name: "kind",
    in: "query",
    required: true,
    schema: { type: "string", enum: ["standard", "simple"] },
  });
  const result = explorer.checkRequest(
    enumSpec,
    "GET",
    "https://api.signatureapi.com/v1/envelopes/env_example/deliverables?limit=100&kind=other&extra=true",
  );
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.problems.map((problem) => problem.parameter),
    ["extra", "limit", "kind"],
  );
  assert.match(result.problems[1].message, /maximum is 20/);
  assert.match(result.problems[2].message, /standard, simple/);
});

test("checkRequest reports a missing required query parameter", () => {
  const requiredSpec = structuredClone(spec);
  requiredSpec.paths["/envelopes/{envelopeId}/deliverables"].get.parameters.push({
    name: "cursor",
    in: "query",
    required: true,
    schema: { type: "string" },
  });
  const result = explorer.checkRequest(requiredSpec, "GET", "/envelopes/env_example/deliverables");
  assert.equal(result.ok, false);
  assert.equal(result.problems[0].parameter, "cursor");
  assert.match(result.problems[0].message, /required/);
});

test("renderRequestCheckMarkdown identifies a local check without script-style or API-style error codes", () => {
  assert.equal(typeof explorer.renderRequestCheckMarkdown, "function");
  const result = explorer.checkRequest(spec, "GET", "/envelopes/env_example/deliverables?limit=100");
  const markdown = explorer.renderRequestCheckMarkdown(result);
  assert.match(markdown, /^# Local request check failed/);
  assert.match(markdown, /No API request was sent\./);
  assert.match(markdown, /maximum is 20/);
  assert.doesNotMatch(markdown, /QUERY_PARAMETER|HTTP 4\d\d|API error/);
});
