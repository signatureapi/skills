# SignatureAPI Agent Skills

Agent Skills for [SignatureAPI](https://signatureapi.com), the e-signature API platform. This repo
contains two skills that let AI coding agents integrate and troubleshoot e-signature workflows
directly from the command line.

## Install

Two ways to install this repo, sharing the same skill content:

- **Cross-runtime (Codex, Cursor, Copilot, Claude Code)** — installs just the skills:

  ```bash
  npx skills add signatureapi/skills
  ```

- **Claude Code plugin** — installs the same skills *and* configures the hosted SignatureAPI
  MCP server (`https://mcp.signatureapi.com/mcp`) in one step:

  ```
  /plugin marketplace add signatureapi/skills
  /plugin install signatureapi
  ```

  Working directly in this repo also picks up the MCP server via the checked-in root
  `.mcp.json` — the same file the plugin installs elsewhere.

## Skills

- **signatureapi-integrate** — add SignatureAPI e-signature flows (envelopes, documents, recipients,
  places, ceremonies) to an application.
- **signatureapi-diagnose** — diagnose stuck envelopes, failed ceremonies, and delivery issues
  against a live SignatureAPI account.

## Environment

Scripts in these skills read `SIGNATUREAPI_KEY`. Use a test-mode key (`key_test_...`) — scripts
refuse live keys (`key_live_...`) by default, since live envelopes are legally binding and email
real people.

## Docs

Full API and agent documentation: https://signatureapi.com/AGENTS.md

## Contributing

Issues and pull requests are welcome.
