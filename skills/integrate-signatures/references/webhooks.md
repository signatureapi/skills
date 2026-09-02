# Webhooks

## Event types

`envelope.created`, `envelope.started`, `envelope.completed`,
`envelope.failed`, `envelope.canceled`, `recipient.released`,
`recipient.sent`, `recipient.accessed`,
`recipient.identity_verification_started`, `recipient.identity_verified`,
`recipient.identity_rejected`, `recipient.viewed`, `recipient.completed`,
`recipient.rejected`, `recipient.soft_bounced`, `recipient.hard_bounced`,
`recipient.failed`, `recipient.replaced`, `recipient.resent`,
`deliverable.generated`, `deliverable.failed`, `sender.created`,
`sender.verified`, `sender.failed`, `sender.deleted`.

## Registering an endpoint

Endpoint registration — and the signing secret it issues — exists only in the
dashboard: `https://dashboard.signatureapi.com/webhooks?mode=test`. There is no
API or MCP operation for it. This is a real gap, worth reporting at
https://github.com/signatureapi/skills/issues/new if you hit it repeatedly.

Test and live endpoints are separate; a test-mode envelope never notifies a
live endpoint and vice versa.

## Local development

A local endpoint isn't reachable from SignatureAPI without a tunnel. Two
options:

- Tunnel `scripts/webhook-receiver.mjs` (e.g. `npx untun@latest tunnel
  http://localhost:4000`) and register the public URL as a test-mode endpoint.
- Or skip webhooks during development and poll instead:
  `node scripts/watch-events.mjs --envelope <id>`, or `GET
  /envelopes/{id}/events` directly. This is the honest fallback, not a
  workaround — there's no webhook-delivery log anywhere, so once an endpoint
  is registered, the events endpoint is also how you tell "my handler never
  ran" apart from "the event never arrived."

## Handler shape

Handlers must be idempotent — the same event can be delivered more than once.
Key on the event's `id`, not just its `type`, if you need to deduplicate.
