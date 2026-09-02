import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilemap, extractLeadingComment } from "../update-filemap.mjs";

test("buildFilemap renders one line per entry, sorted by path", () => {
  const out = buildFilemap([
    { path: "skills/b/SKILL.md", description: "B" },
    { path: "skills/a/SKILL.md", description: "A" },
  ]);
  const lines = out.trim().split("\n");
  assert.ok(lines[0].startsWith("# "));
  assert.ok(out.indexOf("skills/a/SKILL.md") < out.indexOf("skills/b/SKILL.md"));
});

test("extractLeadingComment reads a // block after the shebang, not a later mid-file comment", () => {
  const text = [
    "#!/usr/bin/env node",
    "// Does the thing.",
    "// Second line.",
    'import { ok } from "./lib.mjs";',
    "",
    "// This mid-file comment must never be picked up as the description.",
    "ok();",
  ].join("\n");
  assert.equal(extractLeadingComment(text), "Does the thing. Second line.");
});

test("extractLeadingComment reads a leading JSDoc block", () => {
  const text = ["#!/usr/bin/env node", "/** Does the thing. */", "ok();"].join("\n");
  assert.equal(extractLeadingComment(text), "Does the thing.");
});

test("extractLeadingComment returns null when the file opens straight into code", () => {
  const text = ['#!/usr/bin/env node\nimport { ok } from "./lib.mjs";\nok();'].join("\n");
  assert.equal(extractLeadingComment(text), null);
});

test("FILEMAP.md has no bare-file-type description and lists no untracked file", async () => {
  const filemap = await (await import("node:fs/promises")).readFile(
    new URL("../FILEMAP.md", import.meta.url),
    "utf8",
  );
  const entryLines = filemap.split("\n").filter((l) => l.startsWith("- `"));
  assert.ok(entryLines.length > 0);
  for (const line of entryLines) {
    const description = line.split(" — ").slice(1).join(" — ");
    assert.doesNotMatch(description, /^(mjs|md|json)$/, `${line} reads as a bare file type`);
  }
  assert.ok(
    !filemap.includes("package-lock.json") || filemap.match(/package-lock\.json` — npm lockfile/),
    "package-lock.json, if listed, must be described as a real lockfile, not left over from an untracked scan",
  );
});
