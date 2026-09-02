import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilemap } from "../update-filemap.mjs";

test("buildFilemap renders one line per entry, sorted by path", () => {
  const out = buildFilemap([
    { path: "skills/b/SKILL.md", description: "B" },
    { path: "skills/a/SKILL.md", description: "A" },
  ]);
  const lines = out.trim().split("\n");
  assert.ok(lines[0].startsWith("# "));
  assert.ok(out.indexOf("skills/a/SKILL.md") < out.indexOf("skills/b/SKILL.md"));
});
