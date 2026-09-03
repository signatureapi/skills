# Webhooks

*Reference for the SignatureAPI signatureapi-integrate skill — test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

## Event types

The complete, current list of event types and each one's payload schema is in
the spec's `webhooks` section — read it from there, not from memory:

    node scripts/openapi-explore.mjs webhooks

The ones this skill's workflow depends on: `envelope.completed` (the minimum
a handler must process), `deliverable.generated` (signed documents ready),
and `recipient.soft_bounced` / `recipient.hard_bounced` (live-mode email
delivery failures). If this file and the spec disagree, the spec wins.

## Event payload shape

Every event has the same envelope: `{id, type, timestamp, data: {...}}`.
`data` always carries `envelope_id`, `object_id`, `object_type`, plus
fields specific to the event type. Real example, captured from staging
(`GET /envelopes/{envelopeId}/events`):

```json
{
  "id": "evt_4ergJwldKlibL9pasqeyPf",
  "type": "envelope.completed",
  "timestamp": "2026-09-02T17:34:05.618Z",
  "data": {
    "envelope_id": "223c4d7d-10c3-4f69-8b82-f537158fe50a",
    "object_id": "223c4d7d-10c3-4f69-8b82-f537158fe50a",
    "object_type": "envelope",
    "envelope_metadata": {}
  }
}
```

There is no `data.envelope` object — don't guess a nested shape; fetch the
envelope separately (`GET /envelopes/{envelopeId}` from the application, or
MCP `get_envelope` while you work) if you need more than the id.

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
  It binds to `127.0.0.1` by default (not the LAN-reachable `0.0.0.0`); pass
  `--host <address>` to bind somewhere else explicitly.
- Or skip webhooks during development and poll instead:
  `node scripts/watch-events.mjs --envelope <id>`, or `GET
  /envelopes/{envelopeId}/events` directly. This is the honest fallback, not a
  workaround — there's no webhook-delivery log anywhere, so once an endpoint
  is registered, the events endpoint is also how you tell "my handler never
  ran" apart from "the event never arrived."

## Handler shape

Handlers must be idempotent — the same event can be delivered more than once.
Key on the event's `id`, not just its `type`, if you need to deduplicate.

Signature verification needs the raw request bytes, not the parsed body —
hashing a re-serialized JSON object almost never matches the bytes
SignatureAPI signed. If the host app parses JSON globally (`app.use(express.json())`
or equivalent), that parser consumes the body before a route-local raw parser
ever sees it, and verification fails even though the code looks right. The
webhook route must be mounted before the global JSON parser, or excluded from
it — don't copy an existing handler's body-parsing setup without checking
this. In Express, scope a raw body parser to just the webhook path and
register it ahead of the global one:

```js
// Register this BEFORE app.use(express.json()) — order matters.
app.post(
  "/webhooks/signatureapi",
  express.raw({ type: "application/json" }),
  (req, res) => {
    // req.body is a Buffer here, not a parsed object — verify the
    // signature against these raw bytes, then JSON.parse(req.body).
  },
);

app.use(express.json()); // applies to every other route
```

Other frameworks: whatever gives you the unparsed body (a raw-body option,
a middleware ordered ahead of the JSON parser, a framework hook that runs
before body parsing) — the rule is the same: verify against bytes the
framework has not already parsed and re-serialized.
