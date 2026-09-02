# SignatureAPI Agent Skills

Agent Skills for [SignatureAPI](https://signatureapi.com), the e-signature API. Two skills that
let AI coding agents build and troubleshoot e-signature integrations directly from the command
line: one for building a signing flow, one for diagnosing one that already exists.

## Install

There are two install paths. They share the same skill content but are not equivalent — pick
based on whether you also want the hosted MCP server configured.

**Cross-runtime** (Claude Code, Codex, Cursor, Copilot) — installs the two skills only, no MCP
configuration:

```bash
npx skills add signatureapi/skills
```

**Claude Code plugin** — installs the same two skills *and* configures the hosted SignatureAPI
MCP server (`https://mcp.signatureapi.com/mcp`) in one step:

```
/plugin marketplace add signatureapi/skills
/plugin install signatureapi@signatureapi
```

The plugin install raises no authentication prompt. The MCP server is configured but
unauthenticated until you first use it, at which point Claude Code reports `! Needs
authentication` and `claude mcp login` walks you through OAuth.

The plugin is all-or-nothing: skills and MCP server install and uninstall together. There's no
flag to take one without the other, and `claude mcp remove` refuses to remove a plugin-owned
server. If you want the skills without the MCP server, use the `npx skills` path instead.

Working directly in this repo also picks up the MCP server via the checked-in root `.mcp.json` —
the same file the plugin installs elsewhere.

## Skills

- **[signatureapi-integrate](skills/signatureapi-integrate)** — build or change an integration:
  create an envelope, place signature fields, wire up webhooks, and verify the whole flow end to
  end against a real test-mode envelope.
- **[signatureapi-diagnose](skills/signatureapi-diagnose)** — diagnose a misbehaving integration:
  an envelope stuck in processing, a webhook that never arrived, a recipient who never got the
  signing email, a missing deliverable, or a validation error on create.

Each skill talks to the MCP server first and falls back to the REST API when a tool is missing.
Its `SKILL.md` also carries a handful of scripts for the parts an agent shouldn't improvise:
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

## License

MIT — see [LICENSE](LICENSE).
