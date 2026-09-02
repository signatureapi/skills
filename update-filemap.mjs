#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export function buildFilemap(entries) {
  const lines = ["# FILEMAP", "", "Every file in this repo and what it is for.", ""];
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`- \`${entry.path}\` — ${entry.description}`);
  }
  return `${lines.join("\n")}\n`;
}

// Hand-maintained fallback for scripts with no leading file-level comment to
// pull a description from. Keyed by path suffix (matched with endsWith), so
// one entry covers a script shared verbatim across skills (e.g. lib/output.mjs).
// Keep in sync when a script is added, renamed, or gains/loses a leading comment.
const FALLBACK_DESCRIPTIONS = {
  "scripts/check-setup.mjs": "Checks credentials, mode, and API reachability",
  "scripts/create-test-envelope.mjs": "Prints or creates a minimum viable test envelope",
  "scripts/make-test-document.mjs": "Builds and uploads a throwaway test PDF",
  "scripts/openapi-explore.mjs": "Queries the bundled OpenAPI spec: paths, path detail, schema",
  "scripts/watch-events.mjs": "Polls envelope events until a terminal status",
  "scripts/webhook-receiver.mjs": "Local HTTP receiver that prints arriving webhook events",
  "scripts/diagnose-envelope.mjs": "Diagnoses why an envelope is stuck or missing a deliverable",
  "scripts/complete-ceremony.mjs": "Branch B: drives a real browser through a ceremony (consent-gated)",
  "scripts/lib/output.mjs": "Shared ok/fail/gap JSON output helpers for every script",
};

/** The first leading comment block in a script, after an optional shebang —
 * a `/** *\/` JSDoc block or a run of `//` lines — never a comment found
 * later in the file. Returns null if the file doesn't open with one. */
export function extractLeadingComment(text) {
  const lines = text.split("\n");
  let i = 0;
  if (lines[i]?.startsWith("#!")) i++;
  while (lines[i] === "") i++;

  if (lines[i]?.startsWith("/**") || lines[i]?.startsWith("/*")) {
    const collected = [];
    while (i < lines.length) {
      const stripped = lines[i]
        .replace(/^\s*\/\*\*?/, "")
        .replace(/\*\/\s*$/, "")
        .replace(/^\s*\*\s?/, "")
        .trim();
      if (stripped) collected.push(stripped);
      if (lines[i].includes("*/")) break;
      i++;
    }
    return collected.length ? collected.join(" ") : null;
  }

  if (lines[i]?.startsWith("//")) {
    const collected = [];
    while (lines[i]?.startsWith("//")) {
      const stripped = lines[i].replace(/^\/\/\s?/, "");
      if (stripped) collected.push(stripped);
      i++;
    }
    return collected.length ? collected.join(" ") : null;
  }

  return null;
}

async function describePackageJson(file) {
  const json = JSON.parse(await readFile(file, "utf8"));
  const deps = Object.keys(json.dependencies ?? {});
  return `npm manifest for ${json.name} (dependencies: ${deps.length ? deps.join(", ") : "none"})`;
}

async function describe(file) {
  if (file.endsWith("SKILL.md")) {
    const text = await readFile(file, "utf8");
    const match = text.match(/^description:\s*"?(.+?)"?$/m);
    return match ? match[1] : "Skill entrypoint";
  }
  if (file.endsWith(".md")) {
    const text = await readFile(file, "utf8");
    const heading = text.match(/^#\s+(.+)$/m);
    return heading ? heading[1] : "Reference document";
  }
  if (file.endsWith("package-lock.json")) {
    return "npm lockfile pinning this skill's dependencies for reproducible installs";
  }
  if (file.endsWith("package.json")) {
    return describePackageJson(file);
  }

  const text = await readFile(file, "utf8").catch(() => "");
  const leading = extractLeadingComment(text);
  if (leading) return leading;

  const fallbackKey = Object.keys(FALLBACK_DESCRIPTIONS).find((key) => file.endsWith(key));
  if (fallbackKey) return FALLBACK_DESCRIPTIONS[fallbackKey];

  throw new Error(`No description available for ${file} — add a leading comment or a FALLBACK_DESCRIPTIONS entry`);
}

async function trackedFiles() {
  // git ls-files, not a filesystem walk: a local, uncommitted artifact
  // (e.g. an untracked package-lock.json) must never leak into the index.
  const { stdout } = await execFileAsync("git", ["ls-files", "skills"]);
  return stdout.split("\n").filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await trackedFiles();
  const entries = await Promise.all(files.map(async (f) => ({ path: f, description: await describe(f) })));
  await writeFile("FILEMAP.md", buildFilemap(entries));
  console.log(`Wrote FILEMAP.md with ${entries.length} entries.`);
}
