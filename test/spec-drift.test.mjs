import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);

// The skills inline concepts and gotchas; every API identifier they name is
// supposed to exist in the published OpenAPI spec. This test is the mechanism
// that keeps that true after publication: it pulls the live spec and fails
// when a skill mentions an event type, a REST path, or a snake_case
// identifier the spec no longer (or never) had. `places.md` shipped with three
// place types that were not in the spec; this would have caught all three.
//
// Runs against the network on purpose — a spec change is exactly what it
// must notice, and the daily CI schedule is what turns that into an alert.
// Point SIGNATUREAPI_SPEC_URL elsewhere to test a candidate spec.
const SPEC_URL = process.env.SIGNATUREAPI_SPEC_URL ?? "https://spec.signatureapi.com/openapi.yaml";

// The skills' own copy of the yaml dependency — there is no root package.
const require = createRequire(new URL("../skills/signatureapi-integrate/package.json", import.meta.url));

async function loadSpec() {
  const { parse } = require("yaml");
  const res = await fetch(SPEC_URL);
  assert.ok(res.ok, `could not fetch ${SPEC_URL}: HTTP ${res.status}`);
  return parse(await res.text());
}

async function skillMarkdownFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "skills"]);
  const files = stdout.split("\n").filter((f) => /^skills\/[^/]+\/(SKILL\.md|references\/.+\.md)$/.test(f));
  assert.ok(files.length >= 6, `expected the known SKILL.md and references files, found ${files.length}`);
  return files;
}

/** Every string that could legitimately be quoted as an identifier: enum
 * values, property names, parameter names, schema names, webhook types —
 * collected by walking the whole spec, so a new field shows up here without
 * this test needing to know where it lives. */
export function collectSpecIdentifiers(spec) {
  const ids = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && value && typeof value === "object") {
        for (const name of Object.keys(value)) ids.add(name);
      }
      if (key === "enum" && Array.isArray(value)) {
        for (const v of value) if (typeof v === "string") ids.add(v);
      }
      if (key === "name" && typeof value === "string") ids.add(value);
      if (key === "required" && Array.isArray(value)) {
        for (const v of value) if (typeof v === "string") ids.add(v);
      }
      walk(value);
    }
  };
  walk(spec);
  for (const name of Object.keys(spec?.components?.schemas ?? {})) ids.add(name);
  for (const type of Object.keys(spec?.webhooks ?? {})) ids.add(type);
  return ids;
}

/** `/envelopes/{envelopeId}/events` and `/envelopes/{id}/events` describe the
 * same route; the parameter *name* is what a skill is most likely to get
 * wrong, so paths are compared with every `{…}` collapsed. */
export function normalizePath(p) {
  return p.replace(/\{[^}]*\}/g, "{}");
}

export function extractMentions(markdown) {
  const backticked = [...markdown.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  const events = new Set();
  const routes = new Set();
  const identifiers = new Set();
  for (const raw of backticked) {
    const route = raw.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)$/i);
    if (route) {
      routes.add(`${route[1].toUpperCase()} ${route[2]}`);
      continue;
    }
    if (/^(envelope|recipient|deliverable|sender)\.[a-z_]+$/.test(raw)) {
      events.add(raw);
      continue;
    }
    // A bare snake_case word — `recipient_key`, `envelope_date` — is an API
    // identifier claim. Commands, flags, URLs and JSON snippets are not.
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+_?$/.test(raw)) identifiers.add(raw);
  }
  return { events, routes, identifiers };
}

function loadAllowlist() {
  return readFile(new URL("./spec-drift.allowlist.json", import.meta.url), "utf8").then((text) => {
    const json = JSON.parse(text);
    return new Set(Object.entries(json).flatMap(([k, v]) => (k.startsWith("$") ? [] : v)));
  });
}

test("every event type, REST route and snake_case identifier a skill mentions exists in the published spec", async () => {
  const spec = await loadSpec();
  const specIds = collectSpecIdentifiers(spec);
  const specEvents = new Set(Object.keys(spec.webhooks ?? {}));
  const specRoutes = new Set();
  for (const [p, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item)) {
      if (/^(get|post|put|patch|delete)$/.test(method)) specRoutes.add(`${method.toUpperCase()} ${normalizePath(p)}`);
    }
  }
  assert.ok(specEvents.size > 0 && specRoutes.size > 0, "the spec loaded but has no webhooks or paths — wrong URL?");
  const allowlist = await loadAllowlist();

  const problems = [];
  for (const file of await skillMarkdownFiles()) {
    const { events, routes, identifiers } = extractMentions(await readFile(file, "utf8"));
    for (const e of events) if (!specEvents.has(e)) problems.push(`${file}: event type \`${e}\` is not in the spec`);
    for (const r of routes) {
      const [method, p] = r.split(/\s+/);
      if (!specRoutes.has(`${method} ${normalizePath(p)}`)) problems.push(`${file}: route \`${r}\` is not in the spec`);
    }
    for (const id of identifiers) {
      if (!specIds.has(id) && !allowlist.has(id)) {
        problems.push(`${file}: identifier \`${id}\` is neither in the spec nor in test/spec-drift.allowlist.json`);
      }
    }
  }
  assert.deepEqual(problems, [], `skill content has drifted from ${SPEC_URL}:\n${problems.join("\n")}`);
});

test("every allowlisted identifier is still mentioned somewhere, so the allowlist cannot silently grow stale", async () => {
  const allowlist = await loadAllowlist();
  const mentioned = new Set();
  for (const file of await skillMarkdownFiles()) {
    for (const id of extractMentions(await readFile(file, "utf8")).identifiers) mentioned.add(id);
  }
  const stale = [...allowlist].filter((id) => !mentioned.has(id));
  assert.deepEqual(stale, [], `remove these unused entries from test/spec-drift.allowlist.json: ${stale.join(", ")}`);
});

// Docs pages and the spec are the two things an agent is told to *read*; a
// dead link there sends it back to guessing. The API, MCP and dashboard hosts
// are deliberately excluded — their base paths answer a bare GET with 404 or
// a login redirect, which says nothing about whether the skill is right.
test("every docs or spec URL a skill cites resolves", async () => {
  const seen = new Set();
  for (const file of await skillMarkdownFiles()) {
    for (const m of (await readFile(file, "utf8")).matchAll(/https:\/\/(?:spec\.)?signatureapi\.com[^\s`)>"<]*/g)) {
      const url = m[0].replace(/[.,]$/, "");
      if (!url.includes("<")) seen.add(url); // skip the `<slug>.md` twin pattern
    }
  }
  assert.ok(seen.size > 0, "expected at least one docs or spec URL in the skills");
  const broken = [];
  for (const url of seen) {
    const res = await fetch(url, { redirect: "follow" }).catch(() => null);
    if (!res || !res.ok) broken.push(`${url} → ${res ? res.status : "unreachable"}`);
  }
  assert.deepEqual(broken, [], `these URLs no longer resolve:\n${broken.join("\n")}`);
});
