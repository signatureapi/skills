#!/usr/bin/env node
// Part of the SignatureAPI signatureapi-integrate skill. Queries the
// bundled OpenAPI spec (paths, path detail, schema) instead of reading the
// full docs page. Test-mode tooling, not production code. Full workflow:
// SKILL.md.
import { ok, fail } from "./lib/output.mjs";

const SPEC_URL = process.env.SIGNATUREAPI_SPEC_URL ?? "https://spec.signatureapi.com/openapi.yaml";

export function selectSchema(spec, name) {
  const schemas = spec?.components?.schemas ?? {};
  const hit = Object.keys(schemas).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit ? schemas[hit] : null;
}

async function loadSpec() {
  let parse;
  try {
    ({ parse } = await import("yaml"));
  } catch {
    fail("DEPENDENCIES_MISSING", "The yaml package is not installed for this skill.", [
      "npm i    # run once inside the skill directory",
    ]);
  }
  const res = await fetch(SPEC_URL);
  if (!res.ok) {
    fail("SPEC_UNREACHABLE", `Could not fetch ${SPEC_URL} (HTTP ${res.status}).`, [
      `curl -sS ${SPEC_URL} | head`,
      "Check network access, then retry",
    ]);
  }
  return parse(await res.text());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, ...args] = process.argv.slice(2);

  if (!mode || mode === "--help") {
    ok({
      usage: [
        "openapi-explore.mjs paths [filter]        list operations, optionally filtered by substring",
        "openapi-explore.mjs path <method> <path>  show one operation's request body and responses",
        "openapi-explore.mjs schema <name>         show one schema's properties and required fields",
      ],
    });
  }

  const spec = await loadSpec();

  if (mode === "paths") {
    const filter = args[0]?.toLowerCase();
    const out = [];
    for (const [p, item] of Object.entries(spec.paths ?? {})) {
      for (const [method, op] of Object.entries(item)) {
        if (typeof op !== "object" || !op.operationId) continue;
        const line = `${method.toUpperCase()} ${p} — ${op.summary ?? op.operationId}`;
        if (!filter || line.toLowerCase().includes(filter)) out.push(line);
      }
    }
    ok({ count: out.length, operations: out });
  }

  if (mode === "path") {
    const [method, p] = args;
    const op = spec.paths?.[p]?.[method?.toLowerCase()];
    if (!op) {
      fail("OPERATION_NOT_FOUND", `No ${method} ${p} in the spec.`, [
        "node scripts/openapi-explore.mjs paths envelope",
      ]);
    }
    ok({
      operation: op.operationId,
      summary: op.summary,
      request_body: op.requestBody?.content?.["application/json"]?.schema ?? null,
      responses: Object.keys(op.responses ?? {}),
    });
  }

  if (mode === "schema") {
    const schema = selectSchema(spec, args[0] ?? "");
    if (!schema) {
      fail("SCHEMA_NOT_FOUND", `No schema named ${args[0]}.`, ["node scripts/openapi-explore.mjs paths"]);
    }
    ok({
      name: args[0],
      required: schema.required ?? [],
      properties: Object.keys(schema.properties ?? {}),
      schema,
    });
  }

  fail("UNKNOWN_MODE", `Unknown mode "${mode}".`, ["node scripts/openapi-explore.mjs --help"]);
}
