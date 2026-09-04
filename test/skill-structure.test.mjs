import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

// The intake gate is the difference between "build me a DocuSign" producing a
// design conversation and producing three days of unasked-for code. It only
// works if the section exists, sits before Build (an agent reads top-down and
// starts building the moment Build tells it to), and points at the reference
// that carries the three product shapes. This test pins those three facts;
// spec-drift.test.mjs covers the identifiers inside them.
const SKILL = new URL("../skills/signatureapi-integrate/SKILL.md", import.meta.url);
const REFERENCES = new URL("../skills/signatureapi-integrate/references/", import.meta.url);

test("SKILL.md has an Intake section, and it comes before Orient and Build", async () => {
  const text = await readFile(SKILL, "utf8");
  const intake = text.search(/^## Intake/m);
  const orient = text.search(/^## Orient/m);
  const build = text.search(/^## Build/m);
  assert.ok(intake >= 0, "no `## Intake` heading");
  assert.ok(orient >= 0 && build >= 0, "Orient and Build headings must still exist");
  assert.ok(intake < orient && intake < build, "Intake must precede Orient and Build");
});

test("references/product-shapes.md exists and is linked from SKILL.md's References list", async () => {
  const files = await readdir(REFERENCES);
  assert.ok(files.includes("product-shapes.md"), "references/product-shapes.md is missing");
  const text = await readFile(SKILL, "utf8");
  const referencesSection = text.slice(text.search(/^## References/m));
  assert.match(referencesSection, /^- `references\/product-shapes\.md` — /m);
});

test("every file under references/ is listed in SKILL.md's References list", async () => {
  const text = await readFile(SKILL, "utf8");
  const referencesSection = text.slice(text.search(/^## References/m));
  const missing = (await readdir(REFERENCES))
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !referencesSection.includes(`\`references/${f}\``));
  assert.deepEqual(missing, [], `add these to the References list in SKILL.md: ${missing.join(", ")}`);
});
