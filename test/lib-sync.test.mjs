import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("each skill's copy of output.mjs is identical to the source", async () => {
  const source = await readFile("lib/output.mjs", "utf8");
  for (const skill of ["integrate-signatures", "troubleshoot-signatures"]) {
    const copy = await readFile(`skills/engineering/${skill}/scripts/lib/output.mjs`, "utf8");
    assert.equal(copy, source, `${skill} is out of sync — run npm run sync-lib`);
  }
});
