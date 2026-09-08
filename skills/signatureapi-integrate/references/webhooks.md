# Webhooks

*Reference for the SignatureAPI signatureapi-integrate skill. Test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

## Event types

The complete, current list of event types and each one's payload schema is in
the spec's `webhooks` section. Read it from there, not from memory:

    node scripts/openapi-explore.mjs webhooks

This skill's workflow depends on these: `envelope.completed` (the minimum a
handler must process), `deliverable.generated` (signed documents ready), and
`recipient.soft_bounced` / `recipient.hard_bounced` (live-mode email delivery
failures). If this file and the spec disagree, the spec wins.

## Event payload shape

Every event has the same envelope: `{id, type, timestamp, data: {...}}`.
`data` always carries `envelope_id`, `object_id`, `object_type`, plus fields
specific to the event type. Real example, captured from staging
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

There is no `data.envelope` object. Do not guess a nested shape. If you need
more than the id, fetch the envelope separately: `GET /envelopes/{envelopeId}`
from the application, or MCP `get_envelope` while you work.

## Registering an endpoint

Register test-mode endpoints with the MCP webhook tools. `list_webhooks`
first, to avoid a duplicate. Then `create_webhook` with the URL and the event
types. The signing secret is never returned by a tool: `create_webhook`
names the dashboard page where the user reads it
(`signing_secret_dashboard_url`). Ask them to put it in the project's env
file as `SIGNATUREAPI_WEBHOOK_SECRET`, not into the chat. `test_webhook` sends a sample delivery. `list_webhook_attempts` shows each
delivery and its response code, which is how you tell "the event fired"
apart from "my handler never ran". `update_webhook` changes the URL or the
event types without recreating the endpoint. Every one of these takes a
`mode` argument that defaults to test.

Without MCP, the dashboard does the same:
`https://dashboard.signatureapi.com/settings/webhooks?mode=test`. Endpoint
registration has no public REST endpoint.

Test and live endpoints are separate. A test-mode envelope never notifies a
live endpoint, and vice versa.

## Local development

A local endpoint is not reachable from SignatureAPI without a tunnel. Two
options:

- Tunnel `scripts/webhook-receiver.mjs` (for example `npx untun@latest tunnel
  http://localhost:4000`) and register the public URL as a test-mode
  endpoint. It binds to `127.0.0.1` by default, not the LAN-reachable
  `0.0.0.0`. Pass `--host <address>` to bind somewhere else explicitly.
- Or skip webhooks during development and watch events instead:
  `list_events` with the `envelope_id` and `wait_seconds`, or
  `node scripts/watch-events.mjs --envelope <id>` over REST. This is the
  honest fallback, not a workaround. Once an endpoint is registered,
  `list_webhook_attempts` shows whether each delivery reached your handler
  and what it answered.

## Handler shape

Handlers must be idempotent. The same event can be delivered more than once.
Key on the event's `id`, not just its `type`, if you need to deduplicate.

Signature verification needs the raw request bytes, not the parsed body.
Hashing a re-serialized JSON object almost never matches the bytes
SignatureAPI signed. If the host app parses JSON globally
(`app.use(express.json())` or equivalent), that parser consumes the body
first. A route-local raw parser never sees it, and verification fails even
though the code looks right. Mount the webhook route before the global JSON
parser, or exclude it from that parser. Do not copy an existing handler's
body-parsing setup without checking this. In Express, scope a raw body parser
to just the webhook path and register it ahead of the global one:

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

Other frameworks: use whatever gives you the unparsed body. That is a
raw-body option, a middleware ordered ahead of the JSON parser, or a framework
hook that runs before body parsing. The rule is the same: verify against
bytes the framework has not already parsed and re-serialized.
