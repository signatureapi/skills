# SignatureAPI Agent Skills

Agent Skills for [SignatureAPI](https://signatureapi.com), the e-signature API platform. This repo
contains two skills that let AI coding agents integrate and troubleshoot e-signature workflows
directly from the command line.

## Install

```bash
npx skills add signatureapi/skills
```

## Skills

- **integrate-signatures** — add SignatureAPI e-signature flows (envelopes, documents, recipients,
  places, ceremonies) to an application.
- **troubleshoot-signatures** — diagnose stuck envelopes, failed ceremonies, and delivery issues
  against a live SignatureAPI account.

## Environment

Scripts in these skills read `SIGNATUREAPI_KEY`. Use a test-mode key (`key_test_...`) — scripts
refuse live keys (`key_live_...`) by default, since live envelopes are legally binding and email
real people.

## Docs

Full API and agent documentation: https://signatureapi.com/AGENTS.md

## Contributing

Issues and pull requests are welcome.
