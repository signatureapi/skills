import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseSkillFrontmatter,
  loadSkills,
  buildAgentSkillsJson,
  generate,
  REPO,
  HOOK_SCRIPT,
  CLAUDE_HOOKS_PATH,
  CODEX_HOOKS_PATH,
  CURSOR_HOOKS_PATH,
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

// The SessionStart hook: every host that wires it must point at a file the
// generator writes, and every command must run the one shared script.
test("Claude Code, Codex and Cursor manifests name their own generated hook files", async () => {
  const files = await generate();
  const wiring = [
    [".claude-plugin/plugin.json", CLAUDE_HOOKS_PATH],
    [".codex-plugin/plugin.json", CODEX_HOOKS_PATH],
    [".cursor-plugin/plugin.json", CURSOR_HOOKS_PATH],
  ];
  for (const [manifest, hooksPath] of wiring) {
    const parsed = JSON.parse(files[manifest]);
    assert.equal(parsed.hooks, hooksPath, `${manifest} does not name ${hooksPath}`);
    assert.ok(hooksPath.startsWith("./"), `${hooksPath} must be ./-relative to the plugin root`);
    assert.ok(files[hooksPath.slice(2)], `${hooksPath} is not generated`);
  }
});

test("hosts without working plugin hooks get no hook wiring", async () => {
  const files = await generate();
  for (const manifest of [".grok-plugin/plugin.json", "gemini-extension.json", "plugin.json"]) {
    assert.equal(JSON.parse(files[manifest]).hooks, undefined, `${manifest} declares hooks`);
  }
});

test("every hook command runs the shared script with the host's root placeholder", async () => {
  await access(HOOK_SCRIPT);
  const files = await generate();
  const commands = [
    [CLAUDE_HOOKS_PATH.slice(2), (json) => json.hooks.SessionStart[0].hooks[0], ["${CLAUDE_PLUGIN_ROOT}"], "claude"],
    [CODEX_HOOKS_PATH.slice(2), (json) => json.hooks.SessionStart[0].hooks[0], ["$PLUGIN_ROOT"], "codex"],
    [CURSOR_HOOKS_PATH.slice(2), (json) => json.hooks.sessionStart[0], ["${CURSOR_PLUGIN_ROOT}"], "cursor"],
  ];
  for (const [path, pick, placeholders, host] of commands) {
    const handler = pick(JSON.parse(files[path]));
    assert.ok(handler.command.includes(HOOK_SCRIPT), `${path} does not run ${HOOK_SCRIPT}`);
    assert.ok(handler.command.endsWith(`--host ${host}`), `${path} passes the wrong host`);
    for (const placeholder of placeholders) assert.ok(handler.command.includes(placeholder), `${path} lacks ${placeholder}`);
  }
});

// hooks/hooks.json is a default path that Claude Code, Codex, Cursor and
// Gemini CLI each discover on their own. Gemini CLI installs this repo root
// for its MCP server only, so no generated file may take that path.
test("no generated file uses the default hooks/hooks.json path, and every hook times out in seconds", async () => {
  const files = await generate();
  assert.equal(files["hooks/hooks.json"], undefined);
  const handlers = [
    JSON.parse(files[CLAUDE_HOOKS_PATH.slice(2)]).hooks.SessionStart[0],
    JSON.parse(files[CODEX_HOOKS_PATH.slice(2)]).hooks.SessionStart[0],
  ];
  for (const group of handlers) {
    assert.equal(group.matcher, "startup");
    for (const handler of group.hooks) assert.equal(handler.timeout, 10);
  }
  assert.equal(JSON.parse(files[CURSOR_HOOKS_PATH.slice(2)]).hooks.sessionStart[0].timeout, 10);
});
