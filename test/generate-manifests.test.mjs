import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parseSkillFrontmatter,
  loadSkills,
  buildAgentSkillsJson,
  generate,
} from "../generate-manifests.mjs";

test("parseSkillFrontmatter reads name and description out of the YAML frontmatter block", () => {
  const text = [
    "---",
    "name: my-skill",
    'description: "Does the thing."',
    "inputs:",
    "  - name: KEY",
    "    required: true",
    "---",
    "",
    "# My Skill",
  ].join("\n");
  assert.deepEqual(parseSkillFrontmatter(text), { name: "my-skill", description: "Does the thing." });
});

test("loadSkills finds both skills and each frontmatter name matches its directory", async () => {
  const skills = await loadSkills();
  const names = skills.map((s) => s.name);
  assert.deepEqual(names, ["signatureapi-diagnose", "signatureapi-integrate"]);
});

test("buildAgentSkillsJson digests match sha256sum of the actual SKILL.md bytes", async () => {
  const skills = await loadSkills();
  const payload = buildAgentSkillsJson(skills);
  for (const entry of payload.skills) {
    const skill = skills.find((s) => s.name === entry.name);
    const bytes = await readFile(skill.path);
    const expected = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    assert.equal(entry.digest, expected);
  }
});

test("agent-skills.json parses and matches the generator's current output", async () => {
  const onDisk = JSON.parse(await readFile("agent-skills.json", "utf8"));
  const generated = JSON.parse((await generate())["agent-skills.json"]);
  assert.deepEqual(onDisk, generated);
});

// The manifests this generator owns must never drift from skills/*/SKILL.md
// frontmatter — editing a skill's description without running
// `npm run manifests` should break this test, not ship a stale manifest.
test("generated manifests have no diff against the committed files", async () => {
  const files = await generate();
  for (const [path, expected] of Object.entries(files)) {
    const actual = await readFile(path, "utf8");
    assert.equal(actual, expected, `${path} is out of sync — run npm run manifests`);
  }
});
