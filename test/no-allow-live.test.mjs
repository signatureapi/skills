import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// `--allow-live` must not exist anywhere under skills/ — not as a flag, not
// in a comment, not in a doc. Agents run non-interactive and will pass
// whatever flag unblocks them, so a flag that lets a script touch a live key
// is not a safety control; the only real control is the flag's absence from
// the source. This test fails the build the moment anyone reintroduces it,
// including as a stray mention in prose.
test("no tracked file under skills/ contains the string \"allow-live\"", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "skills"]);
  const files = stdout.split("\n").filter(Boolean);
  assert.ok(files.length > 0, "expected git ls-files skills to return tracked files");

  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    if (text.includes("allow-live")) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `these tracked files under skills/ still mention allow-live: ${offenders.join(", ")}`);
});
