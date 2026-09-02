#!/usr/bin/env node
// Regenerates every manifest whose content is derived from skills/*/SKILL.md
// frontmatter — the single source of truth for a skill's name and
// description. Run via `npm run manifests` after adding, renaming, or
// re-describing a skill. `npm test` runs this same generation in-memory and
// fails on any diff against the committed files, so a stale manifest breaks
// CI instead of shipping.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// The repo these raw-GitHub URLs and pinned digests assume. This does NOT
// exist yet as `origin` on this checkout — see the "publish" test in
// test/generate-manifests.test.mjs, which skips cleanly until it does and
// then holds this constant to account. Bumping this (or BRANCH) must ship
// together with `npm run manifests` and a redeploy of whatever serves
// agent-skills.json (see README's Contributing section) — a stale digest
// pinned to a mutable branch ref is worse than no digest.
export const REPO = "signatureapi/skills";
const BRANCH = "main";

/** Pulls `name` and `description` out of a SKILL.md's YAML frontmatter with
 * a small regex reader (matching update-filemap.mjs's approach) rather than
 * a YAML parser, since only these two scalar fields are needed and the repo
 * root carries no yaml dependency. */
export function parseSkillFrontmatter(text) {
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) throw new Error("SKILL.md has no --- frontmatter block");
  const body = frontmatter[1];
  const nameMatch = body.match(/^name:\s*(.+)$/m);
  const descriptionMatch = body.match(/^description:\s*"?(.+?)"?\s*$/m);
  if (!nameMatch) throw new Error("SKILL.md frontmatter has no name");
  if (!descriptionMatch) throw new Error("SKILL.md frontmatter has no description");
  return { name: nameMatch[1].trim(), description: descriptionMatch[1].trim() };
}

/** Every skills/<name>/SKILL.md, parsed, sorted by name. Reads the
 * filesystem (not git ls-files) so a freshly-added, not-yet-committed skill
 * is picked up too — unlike FILEMAP.md, these manifests describe what
 * `npx skills add` and the plugin installer will actually discover on disk. */
export async function loadSkills(skillsDir = "skills") {
  const dirents = await readdir(skillsDir, { withFileTypes: true });
  const names = dirents.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const skills = await Promise.all(
    names.map(async (name) => {
      const path = `${skillsDir}/${name}/SKILL.md`;
      const text = await readFile(path, "utf8");
      const { name: frontmatterName, description } = parseSkillFrontmatter(text);
      if (frontmatterName !== name) {
        throw new Error(`${path}: frontmatter name "${frontmatterName}" does not match its directory "${name}"`);
      }
      return { name, description, path, text };
    }),
  );
  return skills;
}

export function buildPluginJson(skills, version) {
  return {
    name: "signatureapi",
    displayName: "SignatureAPI",
    version,
    description:
      "SignatureAPI e-signature skills, kept in sync with the hosted MCP server configuration so the same install delivers both.",
    author: {
      name: "SignatureAPI",
      url: "https://signatureapi.com",
    },
    homepage: "https://signatureapi.com",
    license: "MIT",
    keywords: skills.map((s) => s.name),
    mcpServers: "./.mcp.json",
  };
}

export function buildMarketplaceJson(skills) {
  return {
    name: "signatureapi",
    owner: {
      name: "SignatureAPI",
      url: "https://signatureapi.com",
    },
    plugins: [
      {
        name: "signatureapi",
        source: "./",
        description:
          "SignatureAPI e-signature skills, kept in sync with the hosted MCP server configuration so the same install delivers both.",
        keywords: skills.map((s) => s.name),
      },
    ],
  };
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The payload served at /.well-known/agent-skills, per the agentskills.io
 * discovery schema: https://schemas.agentskills.io/discovery/0.2.0/schema.json */
export function buildAgentSkillsJson(skills) {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: skills.map((s) => ({
      name: s.name,
      type: "skill-md",
      description: s.description,
      url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${s.path}`,
      digest: `sha256:${sha256Hex(Buffer.from(s.text, "utf8"))}`,
    })),
  };
}

function json(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** The generated content of every manifest this script owns, as a
 * path -> content map — used both to write the files and, in the test, to
 * assert the committed files already match. */
export async function generate() {
  const skills = await loadSkills();
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  return {
    ".claude-plugin/plugin.json": json(buildPluginJson(skills, version)),
    ".claude-plugin/marketplace.json": json(buildMarketplaceJson(skills)),
    "agent-skills.json": json(buildAgentSkillsJson(skills)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await generate();
  for (const [path, content] of Object.entries(files)) {
    await writeFile(path, content);
    console.log(`wrote ${path}`);
  }
}
