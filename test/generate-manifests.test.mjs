import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseSkillFrontmatter,
  loadSkills,
  buildAgentSkillsJson,
  generate,
  REPO,
} from "../generate-manifests.mjs";

const execFileAsync = promisify(execFile);

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

test("loadSkills finds the three skills and each frontmatter name matches its directory", async () => {
  const skills = await loadSkills();
  const names = skills.map((s) => s.name);
  assert.deepEqual(names, ["signatureapi-architecture", "signatureapi-diagnose", "signatureapi-integrate"]);
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

// agent-skills.json pins raw-GitHub URLs to REPO/BRANCH and pins content
// digests to those URLs' bytes at generation time — a mutable branch ref
// backing a byte-pinned digest. That's only coherent if REPO is actually
// where this checkout publishes from. This repo has no `origin` remote yet
// (that's the state today — the repo doesn't exist publicly), so the check
// skips cleanly rather than failing; once a real origin is set, this starts
// enforcing that REPO tracks it, so the two can't silently diverge.
test("generate-manifests.mjs's REPO constant matches the origin remote, when one is configured", async (t) => {
  let remoteUrl;
  try {
    ({ stdout: remoteUrl } = await execFileAsync("git", ["remote", "get-url", "origin"]));
  } catch {
    t.skip("no origin remote configured yet — nothing to check against");
    return;
  }
  remoteUrl = remoteUrl.trim();
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
  assert.ok(match, `origin remote "${remoteUrl}" is not a recognizable GitHub URL`);
  assert.equal(
    match[1],
    REPO,
    `generate-manifests.mjs's REPO ("${REPO}") does not match the origin remote ("${match[1]}") — update REPO, run npm run manifests, and redeploy the agent-skills.json payload together (see README's Contributing section)`,
  );
});
