import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// `grep -rl webhook` (or any other keyword) surfaces these files alongside a
// project's own — an agent that opens one has no SKILL.md in view. Context
// has to travel with the file itself: which skill it belongs to, what it
// does, that it's test-mode tooling and not production code, and where the
// real instructions live. This checks that every top-level script and every
// references/ file opens with a header naming its skill.
const HEADER_LINES = 6;

function skillNameFor(filePath) {
  const match = filePath.match(/^skills\/([^/]+)\//);
  return match ? match[1] : null;
}

test("every script under skills/ and every references/ file opens with a header naming its skill", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "skills"]);
  const files = stdout.split("\n").filter(Boolean).filter((f) => {
    const isTopLevelScript = /^skills\/[^/]+\/scripts\/[^/]+\.mjs$/.test(f);
    const isLibScript = /^skills\/[^/]+\/scripts\/lib\/[^/]+\.mjs$/.test(f);
    const isReference = /^skills\/[^/]+\/references\//.test(f);
    return isTopLevelScript || isLibScript || isReference;
  });
  // Sanity check that the filters above actually matched something, so a
  // future rename can't silently make this test vacuous. This must include
  // scripts/lib/output.mjs — the file that holds the entire live-key gate,
  // and exactly the kind of file `grep -rl requireTestKey` surfaces to an
  // agent with no SKILL.md in view.
  assert.ok(files.length >= 10, `expected at least the 10 known scripts/references, found ${files.length}: ${files.join(", ")}`);
  assert.ok(
    files.includes("skills/signatureapi-integrate/scripts/lib/output.mjs"),
    "expected the lib/output.mjs filter to actually match its file",
  );

  const offenders = [];
  for (const file of files) {
    const skill = skillNameFor(file);
    const text = await readFile(file, "utf8");
    const head = text.split("\n").slice(0, HEADER_LINES).join("\n");
    if (!skill || !head.includes(skill)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `these files don't name their skill in the first ${HEADER_LINES} lines: ${offenders.join(", ")}`,
  );
});
