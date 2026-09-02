import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// signatureapi-diagnose is meant to run against live keys with no consent
// flag, which is only safe because it is read-only by construction. This
// guards that: no script under it may issue a non-GET fetch. A single
// pattern catching only a literal `method: "POST"` inside an object literal
// misses everything shaped even slightly differently — a `new Request(url,
// { method: "POST" })`, an init object built with a spread
// (`{ ...someInit, method: "POST" }`), or a non-GET method reaching the
// network by shelling out to curl instead of fetch (`curl -X POST`). Each
// pattern below targets one of those shapes; a script is an offender if any
// of them match.
const NON_GET_PATTERNS = [
  // fetch(url, { method: "POST" }), new Request(url, { method: "POST" }),
  // and a spread init object carrying `method` all share this same
  // `method: "<value>"` text shape regardless of what object literal it
  // sits inside — the object's own shape (spread or not, Request options or
  // fetch init) doesn't change how `method` is written.
  { name: "fetch/Request init with a non-GET method", pattern: /method\s*:\s*["'`](?!GET["'`])\S/i },
  // `curl -X POST ...` / `curl --request POST ...` shelled out via
  // execFile/exec/spawn — this never goes through fetch or Request at all,
  // so the pattern above can't see it.
  // Tolerates curl's flag and its value being split across separate argv
  // array entries (as execFile/spawn require), e.g. ["-X", "POST"] — the
  // character class between -X and the verb absorbs the quote/comma/space
  // noise that separates them in that form, as well as a plain `-X POST`
  // shell string.
  { name: "curl invocation with a non-GET method", pattern: /(?:-X|--request)(?:["'\s,])*(?!GET\b)[A-Z]{2,}\b/ },
];

test("no script under skills/signatureapi-diagnose/ issues a non-GET HTTP method", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "skills/signatureapi-diagnose"]);
  const files = stdout.split("\n").filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length > 0, "expected at least one script under skills/signatureapi-diagnose");

  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const { name, pattern } of NON_GET_PATTERNS) {
      if (pattern.test(text)) offenders.push(`${file} (${name})`);
    }
  }
  assert.deepEqual(offenders, [], `these scripts under skills/signatureapi-diagnose issue a non-GET method: ${offenders.join(", ")}`);
});

test("the non-GET detector actually catches a Request object, a spread init, and a shelled-out curl -X", () => {
  const requestObjectSample = 'const r = new Request(url, { method: "POST" });';
  const spreadInitSample = 'await fetch(url, { ...baseInit, method: "DELETE" });';
  const curlSample = 'execFileSync("curl", ["-X", "POST", url]);';

  assert.ok(
    NON_GET_PATTERNS.some(({ pattern }) => pattern.test(requestObjectSample)),
    "expected a Request object with a non-GET method to be caught",
  );
  assert.ok(
    NON_GET_PATTERNS.some(({ pattern }) => pattern.test(spreadInitSample)),
    "expected a spread init object with a non-GET method to be caught",
  );
  assert.ok(
    NON_GET_PATTERNS.some(({ pattern }) => pattern.test(curlSample)),
    "expected a shelled-out curl -X POST to be caught",
  );
  assert.ok(
    !NON_GET_PATTERNS.some(({ pattern }) => pattern.test('fetch(url, { headers, method: "GET" })')),
    "expected an explicit method: GET to still be allowed",
  );
});
