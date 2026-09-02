import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// signatureapi-diagnose is meant to run against live keys with no consent
// flag, which is only safe because it is read-only by construction. This
// guards that: no script under it may issue a non-GET fetch. A `method:` is
// only ever legitimate here for the literal value "GET" (fetch already
// defaults to GET, so most calls won't specify it at all).
const NON_GET_METHOD = /method\s*:\s*["'`](?!GET["'`])/i;

test("no script under skills/signatureapi-diagnose/ issues a non-GET HTTP method", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "skills/signatureapi-diagnose"]);
  const files = stdout.split("\n").filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length > 0, "expected at least one script under skills/signatureapi-diagnose");

  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (NON_GET_METHOD.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `these scripts under skills/signatureapi-diagnose issue a non-GET method: ${offenders.join(", ")}`);
});
