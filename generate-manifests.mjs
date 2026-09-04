#!/usr/bin/env node
// Regenerates every manifest whose content is derived from skills/*/SKILL.md
// frontmatter plus the MCP_URL/DESCRIPTION constants below — the single
// source of truth for a skill's name/description and for how every agent
// ecosystem is told about the hosted MCP server. Run via `npm run manifests`
// after adding, renaming, or re-describing a skill, or after touching those
// constants. `npm test` runs this same generation in-memory and fails on any
// diff against the committed files, so a stale manifest breaks CI instead of
// shipping.
//
// All of these manifests share one plugin root: the repo root. Each
// ecosystem's own dotdir (.claude-plugin, .cursor-plugin, .codex-plugin,
// .grok-plugin) or root file (gemini-extension.json, plugin.json/mcp.json
// for the vendor-neutral agent-plugins.org schema) points `skills`/component
// paths back at the single canonical `skills/` directory — never a mirrored
// copy — so a skill's SKILL.md exists exactly once in this repo regardless
// of how many ecosystems install it. Only the MCP *dialect* differs per
// ecosystem (filename and JSON shape), which is why several small
// ecosystem-specific MCP config files exist alongside the shared `skills/`.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
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

// The one hosted MCP server every ecosystem manifest below points at, and
// the shared plugin description. Change these here — never in a generated
// file directly, `npm test` will just flag the drift.
export const MCP_URL = "https://mcp.signatureapi.com/mcp";
const SERVER_NAME = "signatureapi";
const DESCRIPTION =
  "SignatureAPI e-signature skills, kept in sync with the hosted MCP server configuration so the same install delivers both.";
const AUTHOR = { name: "SignatureAPI", url: "https://signatureapi.com" };
const HOMEPAGE = "https://signatureapi.com";

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

// Claude Code resolves a plugin's version from plugin.json, then the
// marketplace entry, then the source's git commit SHA. An explicit version
// pins users: pushes without a bump never reach them and `/plugin update`
// reports "already at the latest version" (that happened within two days of
// publishing 1.0.0). Neither Claude manifest carries a version, so every
// merged commit is an update for anyone who enabled auto-update.
export function buildPluginJson(skills) {
  return {
    name: "signatureapi",
    displayName: "SignatureAPI",
    description: DESCRIPTION,
    author: AUTHOR,
    homepage: HOMEPAGE,
    license: "MIT",
    keywords: skills.map((s) => s.name),
    mcpServers: "./.mcp.json",
  };
}

export function buildMarketplaceJson(skills) {
  return {
    name: "signatureapi",
    owner: AUTHOR,
    plugins: [
      {
        name: "signatureapi",
        source: "./",
        description: DESCRIPTION,
        keywords: skills.map((s) => s.name),
      },
    ],
  };
}

// Claude's own `.mcp.json` dialect: a top-level `mcpServers` map keyed by
// server name, each entry declaring transport `type` and `url`. Cursor and
// Grok Build use this identical shape (confirmed for Cursor against
// cursor.com/docs/reference/plugins; inferred for Grok Build from its
// byte-identical shape in Stripe's reference implementation — see the
// report's confirmed-vs-assumed table), so Grok's plugin.json points its
// `mcpServers` field straight at this same file instead of duplicating it.
export function buildMcpJson() {
  return { mcpServers: { [SERVER_NAME]: { type: "http", url: MCP_URL } } };
}

// Cursor plugin manifest (.cursor-plugin/plugin.json). Cursor discovers
// `mcp.json` at the plugin root automatically, or a plugin manifest may
// embed `mcpServers` directly to override discovery — done here so no
// separate `mcp.json` file is needed at the repo root, leaving that bare
// filename free for the agent-plugins.org schema below.
export function buildCursorPluginJson(skills, version) {
  return {
    name: "signatureapi",
    description: DESCRIPTION,
    version,
    author: AUTHOR,
    homepage: HOMEPAGE,
    license: "MIT",
    keywords: skills.map((s) => s.name),
    mcpServers: buildMcpJson().mcpServers,
  };
}

// Shape shared by Cursor's and Grok Build's own marketplace.json — same
// fields as buildMarketplaceJson, just not Claude-specific.
export function buildEcosystemMarketplaceJson(skills) {
  return {
    name: "signatureapi",
    owner: AUTHOR,
    plugins: [
      {
        name: "signatureapi",
        source: "./",
        description: DESCRIPTION,
        keywords: skills.map((s) => s.name),
      },
    ],
  };
}

// Grok Build plugin manifest (.grok-plugin/plugin.json). Points mcpServers
// at the same root .mcp.json Claude uses (see buildMcpJson's comment).
export function buildGrokPluginJson(skills, version) {
  return {
    name: "signatureapi",
    description: DESCRIPTION,
    version,
    author: AUTHOR,
    homepage: HOMEPAGE,
    license: "MIT",
    keywords: skills.map((s) => s.name),
    mcpServers: "./.mcp.json",
  };
}

// Codex plugin manifest (.codex-plugin/plugin.json). `skills` points at the
// single canonical skills/ directory (component paths in a Codex plugin.json
// resolve relative to the plugin root, i.e. the repo root — confirmed
// against developers.openai.com/plugins/build/plugins). `mcpServers` points
// at a small Codex-dialect file kept inside .codex-plugin/ so its filename
// never collides with any other ecosystem's root-level MCP file.
export function buildCodexPluginJson(skills, version) {
  return {
    name: "signatureapi",
    version,
    description: DESCRIPTION,
    author: AUTHOR,
    homepage: HOMEPAGE,
    license: "MIT",
    keywords: skills.map((s) => s.name),
    skills: "./skills/",
    mcpServers: "./.codex-plugin/mcp-servers.json",
  };
}

// Codex's mcpServers dialect: the file a plugin.json's `mcpServers` field
// points at is a direct map of server name -> config (no wrapping key) —
// per developers.openai.com/plugins/build/plugins's primary example.
export function buildCodexMcpServersJson() {
  return { [SERVER_NAME]: { type: "http", url: MCP_URL } };
}

// Codex's marketplace manifest now lives at .agents/plugins/marketplace.json
// (developers.openai.com/plugins/build/plugins, checked live — Stripe's
// reference still uses the older .codex-plugin/marketplace.json path, which
// is why this is NOT copied from Stripe's example). `policy.authentication:
// "ON_INSTALL"` tells Codex to prompt for OAuth at install time instead of
// deferring silently to first use.
export function buildCodexMarketplaceJson(skills) {
  return {
    name: "signatureapi",
    owner: AUTHOR,
    plugins: [
      {
        name: "signatureapi",
        source: "./",
        description: DESCRIPTION,
        keywords: skills.map((s) => s.name),
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      },
    ],
  };
}

// Gemini CLI extension manifest, at the repo root as required. Uses
// `httpUrl` (not `url`) and an explicit `oauth.enabled` flag — confirmed
// against Gemini CLI's MCP server docs (google-gemini/gemini-cli).
export function buildGeminiExtensionJson(version) {
  return {
    name: "signatureapi",
    version,
    mcpServers: {
      [SERVER_NAME]: {
        httpUrl: MCP_URL,
        oauth: { enabled: true },
      },
    },
  };
}

// Vendor-neutral agent-plugins.org schema (1.0.0). Both files sit at the
// repo root using their bare, un-prefixed filenames (`plugin.json`,
// `mcp.json`) — free because every other ecosystem here namespaces its own
// manifest under a dotdir. Skills are discovered by fixed convention from
// `<plugin root>/skills/` with no configurable path, so putting these files
// at the repo root (rather than a subdirectory) is what lets this ecosystem
// see the real `skills/` directory instead of needing a mirrored copy.
export function buildAgentPluginsPluginJson(skills, version) {
  return {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "signatureapi",
    version,
    description: DESCRIPTION,
    author: AUTHOR,
    homepage: HOMEPAGE,
    license: "MIT",
    keywords: skills.map((s) => s.name),
  };
}

export function buildAgentPluginsMcpJson() {
  return {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { [SERVER_NAME]: { type: "streamable-http", url: MCP_URL } },
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
    ".claude-plugin/plugin.json": json(buildPluginJson(skills)),
    ".claude-plugin/marketplace.json": json(buildMarketplaceJson(skills)),
    "agent-skills.json": json(buildAgentSkillsJson(skills)),
    ".mcp.json": json(buildMcpJson()),
    ".cursor-plugin/plugin.json": json(buildCursorPluginJson(skills, version)),
    ".cursor-plugin/marketplace.json": json(buildEcosystemMarketplaceJson(skills)),
    ".grok-plugin/plugin.json": json(buildGrokPluginJson(skills, version)),
    ".grok-plugin/marketplace.json": json(buildEcosystemMarketplaceJson(skills)),
    ".codex-plugin/plugin.json": json(buildCodexPluginJson(skills, version)),
    ".codex-plugin/mcp-servers.json": json(buildCodexMcpServersJson()),
    ".agents/plugins/marketplace.json": json(buildCodexMarketplaceJson(skills)),
    "gemini-extension.json": json(buildGeminiExtensionJson(version)),
    "plugin.json": json(buildAgentPluginsPluginJson(skills, version)),
    "mcp.json": json(buildAgentPluginsMcpJson()),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await generate();
  for (const [path, content] of Object.entries(files)) {
    const dir = path.replace(/\/[^/]+$/, "");
    if (dir !== path) await mkdir(dir, { recursive: true });
    await writeFile(path, content);
    console.log(`wrote ${path}`);
  }
}
