# SignatureAPI Agent Skills

Agent Skills for [SignatureAPI](https://signatureapi.com), the e-signature API. Two skills that
let AI coding agents build and troubleshoot e-signature integrations directly from the command
line: one for building a signing flow, one for diagnosing one that already exists.

## Install

**Let your agent do it.** Paste this into Claude Code, Codex, Cursor, or any agent that can read a
URL, and it installs the right thing for itself:

```text
Set up SignatureAPI for me. Read https://signatureapi.com/docs/ai-toolkit/mcp/connecting-clients.md
and follow the section for the agent you are running in. If I am working on a codebase, install the
SignatureAPI plugin (skills plus MCP server) rather than the MCP server alone. Ask me before opening
a browser for sign-in, and never print tokens or keys. When you are done, prove it works by listing
my 5 most recent test-mode envelopes, then tell me what you changed and how to undo it.
```

**Or do it by hand.** There are two install paths. They share the same skill content but are not equivalent — pick
based on whether you also want the hosted MCP server (`https://mcp.signatureapi.com/mcp`,
OAuth-authenticated) configured.

**Cross-runtime** (Claude Code, Codex, Cursor, Copilot, Amp, Antigravity, and others) — installs
the two skills only, no MCP configuration:

```bash
npx skills add signatureapi/skills
```

**Plugin install** — installs the same two skills *and* configures the hosted MCP server in one
step. Every ecosystem below installs from this same repo root — nothing is mirrored per
ecosystem, so the plugin path and the `npx skills` path always carry identical skill content:

| Ecosystem | Install |
|---|---|
| Claude Code | `/plugin marketplace add signatureapi/skills` then `/plugin install signatureapi@signatureapi` |
| Cursor | Add marketplace `signatureapi/skills`, then install the `signatureapi` plugin (see [Cursor's plugin docs](https://cursor.com/docs/plugins)) |
| Codex | `codex plugin marketplace add signatureapi/skills` then `codex plugin install signatureapi` |
| Grok Build | Add marketplace `signatureapi/skills` via `/marketplace`, then install the `signatureapi` plugin |
| Gemini CLI | `gemini extensions install https://github.com/signatureapi/skills` |
| Any agent-plugins.org-compatible client | Point it at this repo root — `plugin.json` and `mcp.json` follow the [agent-plugins.org 1.0.0 schema](https://agent-plugins.org/specification) |

Claude Code's plugin install raises no authentication prompt — the MCP server is configured but
unauthenticated until you first use it, at which point Claude Code reports `! Needs
authentication` and `claude mcp login` walks you through OAuth. Where the ecosystem lets us say
so upfront instead, we do: Codex's manifest sets `policy.authentication: "ON_INSTALL"` and
Gemini's sets `oauth.enabled: true`, so those two prompt for auth at install time rather than
deferring silently to first use.

**Staying current.** Claude Code turns auto-update off for third-party marketplaces, so enable it
once after installing: run `/plugin`, open **Marketplaces**, select `signatureapi`, and choose
**Enable auto-update**. Claude Code then checks after each session start and offers
`/reload-plugins` when a new version has landed. To update by hand instead:

```text
/plugin marketplace update signatureapi
/plugin update signatureapi@signatureapi
```

The Claude Code plugin is versioned by commit, so every merge to `main` is a new version; there
is no release step to wait for.

Each plugin install is all-or-nothing: skills and MCP server install and uninstall together.
There's no flag to take one without the other, and (for Claude Code) `claude mcp remove` refuses
to remove a plugin-owned server. If you want the skills without the MCP server, use the
`npx skills` path instead.

Working directly in this repo also picks up the MCP server via the checked-in root `.mcp.json` —
the same file the Claude Code and Grok Build plugins install elsewhere.

## Skills

- **[signatureapi-integrate](skills/signatureapi-integrate)** — build or change an integration:
  create an envelope, place signature fields, wire up webhooks, and verify the whole flow end to
  end against a real test-mode envelope.
- **[signatureapi-diagnose](skills/signatureapi-diagnose)** — diagnose a misbehaving integration:
  an envelope stuck in processing, a webhook that never arrived, a recipient who never got the
  signing email, a missing deliverable, or a validation error on create.

The two surfaces are kept apart on purpose. The code an agent writes into your application calls
the REST API (`https://api.signatureapi.com/v1`); the MCP server and the bundled scripts are the
agent's own tools for inspecting and proving the flow while it works, and never a runtime
dependency of your app. The skills inline concepts and gotchas only — field names, enum values,
event types and limits are read from the published OpenAPI spec on demand, and a CI test fails
this repo whenever an identifier a skill mentions stops existing in that spec.
Each `SKILL.md` also carries a handful of scripts for the parts an agent shouldn't improvise:
querying the OpenAPI spec instead of reading a 108 KB docs page, minting a test document and
creating a test envelope, watching for events or receiving webhooks locally, walking a real
browser through a ceremony, and pulling a verdict for a stuck envelope.

## Requirements

- A SignatureAPI key in the `SIGNATUREAPI_KEY` environment variable. Read from the environment
  only — never pass it as a command-line argument, since argv is exposed in shell history and
  process listings on any shared or logged system.
- Node.js 22 or later.

## Safety

- **signatureapi-integrate works in test mode only.** A `key_live_` key is refused, and there is
  no flag or setting that bypasses this — the capability doesn't exist in the code. Test-mode
  envelopes are free, watermarked, not legally binding, and send no email to recipients.
- **signatureapi-diagnose is read-only by construction.** Every script issues GET requests only,
  and its `allowed-tools` frontmatter restricts it to read-only tools even if a script is added
  later. It runs against either a test or a live key and reports which mode it resolved, so
  diagnosing a production envelope during an incident is safe.

## Docs

- Full documentation: https://signatureapi.com/docs
- Agent router (start here for machine-readable docs): https://signatureapi.com/AGENTS.md
- OpenAPI spec: https://spec.signatureapi.com/openapi.yaml

## Contributing

Issues and pull requests are welcome: https://github.com/signatureapi/skills

After changing a skill's `SKILL.md` frontmatter (name, description) or the
package version, run `npm run manifests` and commit every regenerated manifest in the same
change — `npm test` fails otherwise. That's every per-ecosystem plugin/marketplace manifest
(`.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `.agents/plugins/`, `.grok-plugin/`,
`gemini-extension.json`, root `plugin.json`/`mcp.json`), the root `.mcp.json`, and
`agent-skills.json` — all derived from `skills/*/SKILL.md` frontmatter and the `MCP_URL`
constant in `generate-manifests.mjs`, never hand-edited. The
`agent-skills.json` payload is also served from elsewhere (the
`https://signatureapi.com/.well-known/agent-skills` discovery endpoint), so
that redeploy has to happen together with the commit, not sometime after
it — a stale served copy re-introduces the exact stale-manifest problem
`npm test` exists to catch.

## License

MIT — see [LICENSE](LICENSE).
