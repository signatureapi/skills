---
name: signatureapi-diagnose
description: "SignatureAPI failure runbook. Use when an envelope is stuck in processing, a signature webhook never arrived, or a recipient never got the signing email. Also use when a deliverable is missing after completion, or the API returns 422 on envelope creation. Use it even for a seemingly simple case like one missing email, since test mode never sends real email. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
allowed-tools: Bash, Read, Grep, WebFetch
inputs:
  - name: SIGNATUREAPI_KEY
    required: true
---

# Troubleshoot SignatureAPI

Start here: `node scripts/diagnose-envelope.mjs --envelope <id>`. It fetches
the envelope and its events in one pass and prints a verdict with next steps.

## When to reach for something else

- **Deciding how an app should use SignatureAPI** belongs to
  `signatureapi-architecture`.
- **Building a new signing flow** (creating envelopes, placing signature
  fields, wiring up a webhook for the first time) belongs to
  `signatureapi-integrate`.
- **A webhook that is not a SignatureAPI webhook** belongs to whatever sent
  it. The symptoms and event shapes below are specific to SignatureAPI.
- **A different e-signature vendor** (DocuSign, Dropbox Sign, Adobe Sign,
  etc.) needs that vendor's own docs. The failure codes and symptoms here
  are SignatureAPI-specific.
- **A project with no SignatureAPI credentials present** has no envelope to
  diagnose yet. Confirm that first. Do not run this skill's scripts against
  a key that does not exist.

## Access

These are your tools for reading state. The customer's application does not
depend on them. The application integrates against the REST API
(`https://api.signatureapi.com/v1`, header `X-API-Key`). While diagnosing,
use MCP first (`https://mcp.signatureapi.com/mcp`): `whoami`, `get_envelope`
(takes `envelope_id`, not `id`), `list_envelopes`, `list_events`,
`list_webhooks`, `list_webhook_attempts`, `get_deliverables`, `list_emails`,
`get_email`, `search_documentation`. Reads by id work on test and live
envelopes alike. Listings follow the session's mode, which `whoami`
reports. Fall back to REST when a tool is missing. When you have to fall
back, report the gap at https://github.com/signatureapi/skills/issues/new.

Identifiers named below (paths, event types, status codes) are illustrations.
The published spec at `https://spec.signatureapi.com/openapi.yaml` is the
source of truth, and wins if the two disagree.

This skill is read-only by construction. Every script issues GET requests
only. `test/diagnose-read-only.test.mjs` enforces that with a check against
every script under this skill. `allowed-tools` above still lists `Bash`,
since the scripts need it to run. An agent with Bash access could issue any
request it wanted. What keeps this skill read-only is that no script here
writes anything. Because of that, it runs against either a test or a live
key with no flag needed. Reading a production envelope during an incident is
exactly the behaviour wanted here. Every script reports which mode (`test`
or `live`) it ran in, so that is never left ambiguous.

The repair is a separate decision. Once the verdict is clear, name the fix
and ask before applying it. `resend_request` for a signer who lost the
email. `replace_recipient` for a bounced or wrong address. `create_ceremony`
for an expired link. In live mode each one emails a real person.

Read `SIGNATUREAPI_KEY` from the environment only. Never pass it as a
command-line argument. Argv is exposed in shell history and process listings
on any shared or logged system.

## Symptoms

### Envelope stuck in `processing`
Documents are still being fetched and prepared. Almost always an unreachable
document URL. Check two things: does every document URL return 200 to an
anonymous request, and is each file a valid PDF or DOCX?

### No webhook arrived
Split the question in two. Did the event happen? `list_events` with the
`envelope_id`, or `GET /envelopes/{envelopeId}/events`. Was it delivered?
`list_webhook_attempts` for the endpoint shows each delivery and the
response code your handler returned. No attempt means the endpoint is not
subscribed to that event type, or is in the other mode. A non-2xx attempt
means your handler ran and failed. Test and live endpoints are separate. A
test envelope never notifies a live endpoint.

### Recipient never got the email
In **test mode no email is ever sent**. That is by design. Read what would
have been sent with `list_emails`, then `get_email`. In live mode, look for
`recipient.soft_bounced` / `recipient.hard_bounced` events.

### Ceremony link does not work
Links are single-recipient and expire. For `email_link` recipients the link
is the authentication. So the API never returns it in live mode. Only the
test-mode email log exposes it.

### Deliverable missing after completion
Check for a `deliverable.generated` event, then `get_deliverables` (or
`GET /envelopes/{envelopeId}/deliverables`). A `pending` or `processing`
status means not yet, not missing.

### 422 on create
See `references/errors.md` for the response shape and the most common cause.
Check the exact schema with `search_documentation` (MCP) or the OpenAPI spec at
`https://spec.signatureapi.com/openapi.yaml`.

## References

- `references/errors.md` — HTTP status codes and what they mean here
