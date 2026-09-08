import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// STYLE.md rule 11: everything that ships to a customer must read the same
// in a year and must not leak how it was made. Internal ticket ids, session
// links, workspace paths, "verified on" dates and "not yet available"
// qualifiers all belong in commits and PRs, not in the bundle. Tests and the
// generated manifests are exempt: they are not instructions an agent reads.
const BANNED = [
  { name: "internal ticket id", re: /\bSIG-\d+\b/ },
  { name: "session url", re: /claude\.ai\/code\/session/i },
  { name: "workspace path", re: /\/root\/orca\/|\/root\/\.claude|\/Users\/[a-z]+\//i },
  { name: "verification date", re: /\b(verified|checked|tested|confirmed|as of|captured)\s+(on\s+)?\d{4}-\d{2}-\d{2}/i },
  { name: "availability qualifier", re: /\b(not yet (available|deployed|shipped|on the server)|may not be on the server you|tool surface v\d|coming in v\d|deployed to (staging|production) yet)\b/i },
];

async function bundleFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files"]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.startsWith("test/"))
    .filter((f) => !f.includes("/node_modules/"))
    .filter((f) => !f.endsWith("package-lock.json"))
    .filter((f) => /\.(md|mjs|json|yml|yaml)$/.test(f));
}

/** Lines outside fenced code blocks, so a captured sample payload keeps its timestamp. */
function proseLines(text, file) {
  if (!file.endsWith(".md")) return text.split("\n");
  let inFence = false;
  return text.split("\n").filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return false;
    }
    return !inFence;
  });
}

test("the public bundle carries no transient development metadata", async () => {
  const problems = [];
  for (const file of await bundleFiles()) {
    const lines = proseLines(await readFile(file, "utf8"), file);
    lines.forEach((line, i) => {
      for (const { name, re } of BANNED) if (re.test(line)) problems.push(`${file}:${i + 1}: ${name}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(problems, [], `transient metadata in the bundle:\n${problems.join("\n")}`);
});

test("no implementation plans or design specs ship in the bundle", async () => {
  const files = await bundleFiles();
  const plans = files.filter((f) => /^docs\/(plans|specs|superpowers)\//.test(f));
  assert.deepEqual(plans, [], "plans and specs live in the monorepo; the public repo ships skills only");
});
