# Webhooks

*Reference for the SignatureAPI signatureapi-integrate skill. Test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

## Event types

The complete, current list of event types and each one's payload schema is in
the spec's `webhooks` section. Read it from there, not from memory:

    node scripts/openapi-explore.mjs webhooks

This skill's workflow depends on these:

- `envelope.completed`: everyone has finished. Mark the domain row.
- `deliverable.generated`: the signed file is ready. Fetch and store it
  here, not on `envelope.completed`, which can arrive first.
- `recipient.rejected`: a signer declined. The envelope is not cancelled
  for you.
- `recipient.soft_bounced` / `recipient.hard_bounced`: live-mode email
  delivery failures.

If this file and the spec disagree, the spec wins.

Events carry ids, not content. Captured input values (`capture_as`) are
not in any event; read them from the envelope. Deliverable download URLs
expire after an hour. Download the file and store it in the app's own
storage at once. Fetch a fresh URL later with `get_deliverables` or
`GET /envelopes/{envelopeId}/deliverables`.

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

With a shell, the CLI is the shortest path for local development. See
Local development below. It registers the endpoint and writes the signing
secret to the env file for you.

For an endpoint at a URL you already host, or without a shell, register
test-mode endpoints with the MCP webhook tools. `list_webhooks`
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

A local endpoint is not reachable from SignatureAPI without a tunnel. Three
options, best first:

- Use the SignatureAPI CLI. Start the handler, then run this in a
  background shell:

      npx --yes signatureapi listen --forward-to http://127.0.0.1:<port>/<path>

  It opens a tunnel and registers a test-mode endpoint that points at it.
  It forwards each delivery with its original body and signature headers,
  so the handler verifies it exactly as in production. On first run it
  writes `SIGNATUREAPI_WEBHOOK_ID` and `SIGNATUREAPI_WEBHOOK_SECRET` to the
  env file. It never prints the secret. Rerunning `listen` reuses the same
  endpoint and secret. Add `--event <type>` once per event type to
  subscribe to a subset; the default is every event. Pass `--env-file`
  when the project's env file is not the default. Use
  `--public-url <https url>` instead of `--forward-to` when you already
  run your own tunnel.

  With the listener running, send an example to that endpoint only:

      npx --yes signatureapi trigger envelope.completed

  The example is labeled as a test and does not complete any envelope.
  Create and sign a test envelope to prove the full flow. The listener
  does not log deliveries; read the handler's own output. Stop the
  listener with Ctrl-C or by ending its process. That disables the
  endpoint. A crashed listener can leave it enabled; rerun `listen` to
  repair it.
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

Every delivery is signed under the Standard Webhooks spec. Verify it before
you trust the body. The signature covers three headers, `webhook-id`,
`webhook-timestamp` and `webhook-signature`, plus the raw body bytes. The
secret is `SIGNATUREAPI_WEBHOOK_SECRET` (`whsec_…`). Use the Standard
Webhooks library for the app's language
(https://github.com/standard-webhooks/standard-webhooks). Do not write the
HMAC by hand. Reject a failed check with 401 and do nothing else.

Verification needs the raw request bytes, not the parsed body. If the app
parses JSON globally (`app.use(express.json())` or equivalent), that parser
consumes the body first, and verification fails even though the code looks
right. Mount the webhook route before the global JSON parser, or exclude it
from that parser. In Express:

```js
import { Webhook } from "standardwebhooks";

const webhook = new Webhook(process.env.SIGNATUREAPI_WEBHOOK_SECRET);

// Register this BEFORE app.use(express.json()) — order matters.
app.post(
  "/webhooks/signatureapi",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = webhook.verify(req.body, req.headers); // raw Buffer + headers
    } catch {
      return res.sendStatus(401);
    }
    await handleEvent(event); // idempotent: key on event.id
    res.sendStatus(200);
  },
);

app.use(express.json()); // applies to every other route
```

Other frameworks: use whatever gives you the unparsed body, such as a
raw-body option or a hook that runs before body parsing.

Answer 2xx quickly. Any other status counts as a failed delivery and is
retried for up to 48 hours. Handlers must be idempotent: the same event can
arrive more than once. Delivery order is not guaranteed. Key on the event's
`id` to deduplicate, and re-read the envelope when the order matters.
