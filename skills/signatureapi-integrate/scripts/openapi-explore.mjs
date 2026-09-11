#!/usr/bin/env node
// Part of the SignatureAPI signatureapi-integrate skill. Queries the
// bundled OpenAPI spec (paths, path detail, schema) instead of reading the
// full docs page. Test-mode tooling, not production code. Full workflow:
// SKILL.md.
import { ok, fail } from "./lib/output.mjs";

const SPEC_URL = process.env.SIGNATUREAPI_SPEC_URL ?? "https://spec.signatureapi.com/openapi.yaml";

/** Every webhook event type declared in the spec's top-level `webhooks`
 * section, optionally filtered by substring, each with the payload schema its
 * POST body declares. */
export function listWebhooks(spec, filter) {
  const out = [];
  for (const [type, item] of Object.entries(spec?.webhooks ?? {})) {
    if (filter && !type.toLowerCase().includes(filter.toLowerCase())) continue;
    const op = item?.post ?? {};
    out.push({
      type,
      summary: op.summary ?? op.description ?? null,
      payload: op.requestBody?.content?.["application/json"]?.schema ?? null,
    });
  }
  return out;
}

export function selectSchema(spec, name) {
  const schemas = spec?.components?.schemas ?? {};
  const hit = Object.keys(schemas).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit ? schemas[hit] : null;
}

function resolveLocalRef(spec, value) {
  if (!value?.$ref?.startsWith("#/")) return value;
  return value.$ref
    .slice(2)
    .split("/")
    .reduce((node, part) => node?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], spec);
}

function parameterCard(spec, value) {
  const parameter = resolveLocalRef(spec, value) ?? {};
  const schema = resolveLocalRef(spec, parameter.schema) ?? {};
  return {
    name: parameter.name,
    in: parameter.in,
    required: parameter.required ?? false,
    description: parameter.description ?? null,
    type: schema.type ?? null,
    format: schema.format ?? null,
    default: schema.default ?? null,
    enum: schema.enum ?? null,
    minimum: schema.minimum ?? null,
    maximum: schema.maximum ?? null,
  };
}

/** Compact method-aware cards for every operation matching a name, path, summary, or description. */
export function listOperations(spec, filter) {
  const needle = filter?.toLowerCase();
  const operations = [];
  for (const [path, item] of Object.entries(spec?.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!/^(get|post|put|patch|delete)$/i.test(method) || !operation?.operationId) continue;
      const card = {
        name: operation.operationId,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? operation.operationId,
        description: operation.description ?? null,
      };
      const searchable = Object.values(card).filter(Boolean).join(" ").toLowerCase();
      if (!needle || searchable.includes(needle)) operations.push(card);
    }
  }
  return operations;
}

/** Inspect one exact method/path pair. Absence includes nearby operations instead of implying a capability. */
export function inspectOperation(spec, method, path) {
  const normalizedMethod = method?.toUpperCase();
  const operation = spec?.paths?.[path]?.[method?.toLowerCase()];
  if (!operation?.operationId) {
    const relatedTerm = path
      ?.split("/")
      .filter((part) => part && !part.startsWith("{"))
      .at(-1);
    return {
      found: false,
      requested: `${normalizedMethod} ${path}`,
      related: listOperations(spec, relatedTerm ?? path),
    };
  }
  const pathParameters = spec.paths[path].parameters ?? [];
  const operationParameters = operation.parameters ?? [];
  return {
    found: true,
    operation: {
      name: operation.operationId,
      method: normalizedMethod,
      path,
      summary: operation.summary ?? operation.operationId,
      description: operation.description ?? null,
      parameters: [...pathParameters, ...operationParameters].map((parameter) => parameterCard(spec, parameter)),
      request_body: operation.requestBody?.content?.["application/json"]?.schema ?? null,
      responses: Object.keys(operation.responses ?? {}),
    },
  };
}

function operationLine(operation) {
  return `- \`${operation.method} ${operation.path}\` — ${operation.summary}`;
}

/** Agent-readable exact-operation result. This describes a local inspection, never an API response. */
export function renderOperationMarkdown(result) {
  if (!result.found) {
    const related = result.related.length
      ? `\n## Related operations\n\n${result.related.map(operationLine).join("\n")}\n`
      : "";
    return `# Local contract inspection: operation not found\n\nNo API request was sent.\n\n\`${result.requested}\` is not defined by the public OpenAPI contract.\n${related}\nDo not send this request or guess another path.`;
  }
  const { operation } = result;
  const parameters = operation.parameters.length
    ? [
        "## Parameters",
        "",
        "| Name | Location | Required | Contract |",
        "| --- | --- | --- | --- |",
        ...operation.parameters.map((parameter) => {
          const constraints = [parameter.type, parameter.format, parameter.minimum !== null && `minimum ${parameter.minimum}`, parameter.maximum !== null && `maximum ${parameter.maximum}`, parameter.enum && `one of ${parameter.enum.join(", ")}`].filter(Boolean).join(", ");
          return `| \`${parameter.name}\` | ${parameter.in} | ${parameter.required ? "yes" : "no"} | ${constraints || "not specified"} |`;
        }),
        "",
      ].join("\n")
    : "";
  return `# Local contract inspection: ${operation.name}\n\nNo API request was sent.\n\n\`${operation.method} ${operation.path}\`\n\n${operation.summary}\n\n${parameters}## Responses\n\n${operation.responses.map((status) => `- \`${status}\``).join("\n")}`;
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
        "openapi-explore.mjs webhooks [filter]     list webhook event types with their payload schema",
      ],
    });
  }

  const spec = await loadSpec();

  if (mode === "paths" || mode === "operations") {
    const out = listOperations(spec, args[0]);
    ok({ count: out.length, operations: out });
  }

  if (mode === "path" || mode === "operation") {
    const [method, p] = args;
    const result = inspectOperation(spec, method, p);
    if (!result.found) {
      fail("OPERATION_NOT_FOUND", `No ${method} ${p} in the spec.`, [
        "node scripts/openapi-explore.mjs paths envelope",
      ]);
    }
    ok(result.operation);
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

  if (mode === "webhooks") {
    const events = listWebhooks(spec, args[0]);
    if (events.length === 0) {
      fail("WEBHOOK_NOT_FOUND", `No webhook event type matches "${args[0] ?? ""}".`, [
        "node scripts/openapi-explore.mjs webhooks",
      ]);
    }
    ok({ count: events.length, events });
  }

  fail("UNKNOWN_MODE", `Unknown mode "${mode}".`, ["node scripts/openapi-explore.mjs --help"]);
}
