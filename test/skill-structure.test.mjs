import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

// The design-document gate is the difference between "build me a DocuSign"
// producing a design conversation and producing three days of unasked-for
// code. It has two halves: `signatureapi-architecture` writes
// docs/signatureapi-integration.md and gets a yes; `signatureapi-integrate`
// refuses to build anything but a narrow change without that file. This
// test pins the layout both halves depend on. spec-drift.test.mjs covers the
// identifiers inside them; style.test.mjs covers the wording.
const SKILLS = new URL("../skills/", import.meta.url);
const ARCHITECTURE = new URL("signatureapi-architecture/SKILL.md", SKILLS);
const INTEGRATE = new URL("signatureapi-integrate/SKILL.md", SKILLS);
const DESIGN_FILE = "docs/signatureapi-integration.md";

function headingIndex(text, pattern) {
  return text.search(pattern);
}

test("signatureapi-architecture exists, is named after its directory, and has its sections in order", async () => {
  const text = await readFile(ARCHITECTURE, "utf8");
  assert.match(text, /^name: signatureapi-architecture$/m);
  assert.doesNotMatch(text.match(/^---\n([\s\S]*?)\n---/)[1], /^inputs:/m, "the architecture skill must not require an API key");
  const order = [
    /^## Purpose/m,
    /^## Keep the user's vocabulary/m,
    /^## Understand the experience first/m,
    /^## Explore the codebase/m,
    /^## Present the possibilities/m,
    /^## Decide progressively/m,
    /^## Decision matrix/m,
    /^## Cover the whole product/m,
    /^## Write the design document/m,
    /^## Red flags/m,
  ];
  const positions = order.map((p) => headingIndex(text, p));
  positions.forEach((pos, i) => assert.ok(pos >= 0, `missing heading ${order[i]}`));
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i - 1] < positions[i], `heading ${order[i]} is out of order`);
  assert.ok(text.includes(DESIGN_FILE), `the architecture skill must name ${DESIGN_FILE}`);
  // The experience comes before the code, and the shapes are starting points, not a menu.
  assert.ok(headingIndex(text, /^## Understand the experience first/m) < headingIndex(text, /^## Explore the codebase/m), "the user's experience must be established before the codebase is explored");
  assert.match(text, /Starting point: <closest shape .*or "custom">/, "the design template must allow a custom or hybrid shape");
  assert.match(text, /At most four\s+questions per message/, "questions go in small groups, not one questionnaire");
  assert.match(text, /^\| The user's term \| Means, at the API boundary \|$/m, "the design template must carry a vocabulary mapping table");
  assert.ok(text.includes("signatureapi-integrate"), "the architecture skill must hand off to signatureapi-integrate by name");
});

test("product-shapes.md lives in the architecture skill and is linked from its References list", async () => {
  const files = await readdir(new URL("signatureapi-architecture/references/", SKILLS));
  assert.ok(files.includes("product-shapes.md"), "signatureapi-architecture/references/product-shapes.md is missing");
  const integrateFiles = await readdir(new URL("signatureapi-integrate/references/", SKILLS));
  assert.ok(!integrateFiles.includes("product-shapes.md"), "product-shapes.md must not also exist under signatureapi-integrate");
  const text = await readFile(ARCHITECTURE, "utf8");
  const referencesSection = text.slice(headingIndex(text, /^## References/m));
  assert.match(referencesSection, /^- `references\/product-shapes\.md` — /m);
  assert.ok(files.includes("coverage-checklist.md"), "signatureapi-architecture/references/coverage-checklist.md is missing");
  assert.match(referencesSection, /^- `references\/coverage-checklist\.md` — /m);
});

test("signatureapi-integrate starts from the design: the gate precedes Orient and Build, Intake is gone", async () => {
  const text = await readFile(INTEGRATE, "utf8");
  const gate = headingIndex(text, /^## Start from the design/m);
  const orient = headingIndex(text, /^## Orient/m);
  const build = headingIndex(text, /^## Build/m);
  assert.ok(gate >= 0, "no `## Start from the design` heading");
  assert.ok(orient >= 0 && build >= 0, "Orient and Build headings must still exist");
  assert.ok(gate < orient && gate < build, "Start from the design must precede Orient and Build");
  assert.equal(headingIndex(text, /^## Intake/m), -1, "the Intake section moved to signatureapi-architecture; it must not come back here");
  const gateSection = text.slice(gate, orient);
  assert.ok(gateSection.includes("signatureapi-architecture"), "the gate must name the signatureapi-architecture skill");
  assert.ok(gateSection.includes(DESIGN_FILE), `the gate must name ${DESIGN_FILE}`);
  const referencesSection = text.slice(headingIndex(text, /^## References/m));
  assert.doesNotMatch(referencesSection, /^- `references\/product-shapes\.md`/m, "product-shapes.md moved to signatureapi-architecture");
});

test("every file under each skill's references/ is listed in that skill's References list", async () => {
  const dirents = await readdir(SKILLS, { withFileTypes: true });
  const skills = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(skills.sort(), ["signatureapi-architecture", "signatureapi-diagnose", "signatureapi-docs", "signatureapi-integrate"]);
  for (const skill of skills) {
    const text = await readFile(new URL(`${skill}/SKILL.md`, SKILLS), "utf8");
    const referencesSection = text.slice(headingIndex(text, /^## References/m));
    const files = await readdir(new URL(`${skill}/references/`, SKILLS)).catch(() => []);
    const missing = files.filter((f) => f.endsWith(".md")).filter((f) => !referencesSection.includes(`\`references/${f}\``));
    assert.deepEqual(missing, [], `${skill}: add these to the References list in SKILL.md: ${missing.join(", ")}`);
  }
});

test("signatureapi-docs navigates the live docs index and never answers from memory", async () => {
  const text = await readFile(new URL("signatureapi-docs/SKILL.md", SKILLS), "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(frontmatter, /^name: signatureapi-docs$/m);
  assert.doesNotMatch(frontmatter, /^inputs:/m, "the docs skill must not require an API key");
  assert.match(frontmatter, /^allowed-tools: WebFetch\(domain:signatureapi\.com\)$/m);
  assert.match(frontmatter, /even when you think you know the answer/);

  const order = [
    /^## Purpose/m,
    /^## When to reach for something else/m,
    /^## Keep the user's vocabulary/m,
    /^## Sources, in order/m,
    /^## Find the pages/m,
    /^## Answer/m,
    /^## Vocabulary/m,
  ];
  const positions = order.map((p) => headingIndex(text, p));
  positions.forEach((pos, i) => assert.ok(pos >= 0, `missing heading ${order[i]}`));
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i - 1] < positions[i], `heading ${order[i]} is out of order`);

  const reachFor = text.slice(positions[1], positions[2]);
  assert.match(reachFor, /openapi-explore\.mjs/, "field-level questions go to the OpenAPI spec");

  assert.ok(text.includes("https://signatureapi.com/llms.txt"));
  assert.ok(
    text.indexOf("llms.txt") < text.indexOf("search_documentation"),
    "the index comes before the keyword search",
  );
  assert.match(text, /Memory is not a source/);
  assert.match(text, /Choose by meaning/);
  assert.match(text, /Stop after three rounds/);
  assert.match(text, /unverified/);
  assert.doesNotMatch(text, /llms-full\.txt/, "the skill never downloads the full corpus");
  assert.match(text, /verbatim/, "a summarizing fetch tool must be asked for the full text");
  assert.match(text, /`curl -s/, "with a shell, fetch the raw page Markdown");
});

test("the other skills hand docs research to signatureapi-docs instead of repeating it", async () => {
  for (const skill of ["signatureapi-architecture", "signatureapi-diagnose", "signatureapi-integrate"]) {
    const text = await readFile(new URL(`${skill}/SKILL.md`, SKILLS), "utf8");
    const start = headingIndex(text, /^## When to reach for something else/m);
    assert.ok(start >= 0, `${skill}: missing "When to reach for something else"`);
    const rest = text.slice(start + 1);
    const section = rest.slice(0, rest.search(/^## /m));
    assert.match(section, /`signatureapi-docs`/, `${skill}: name signatureapi-docs under "When to reach for something else"`);
    assert.doesNotMatch(text, /`search_documentation` \(MCP\)/, `${skill}: send prose lookups to signatureapi-docs`);
    assert.doesNotMatch(text, /Markdown twin/, `${skill}: page Markdown is the docs skill's job`);
  }
});
