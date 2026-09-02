---
name: signatureapi-diagnose
description: "SignatureAPI failure runbook. Use when an envelope is stuck in processing, a signature webhook never arrived, a recipient never got the signing email, a deliverable is missing after completion, or the API returns 422 on envelope creation."
allowed-tools: Bash, Read, Grep, WebFetch
inputs:
  - name: SIGNATUREAPI_KEY
    required: true
---

# Troubleshoot SignatureAPI

Start here: `node scripts/diagnose-envelope.mjs --envelope <id>` — it fetches the
envelope and its events in one pass and prints a verdict with next steps.

## Access

MCP first (`https://mcp.signatureapi.com/mcp`): `get_envelope`, `list_envelopes`,
`list_emails`, `get_email`, `search_documentation`. REST fallback at
`https://api.signatureapi.com/v1` with the `X-API-Key` header. When you have to
fall back, report the gap at https://github.com/signatureapi/skills/issues/new.

This skill is read-only by construction — every script issues GET requests
only, and `allowed-tools` above keeps it to read-only tools even if a script
is added later. Because of that, it runs against either a test or a live key
with no flag needed: reading a production envelope during an incident is
exactly the behaviour wanted here. Every script reports which mode
(`test` or `live`) it actually ran in, so that is never left ambiguous.

`SIGNATUREAPI_KEY` is read from the environment only. Never pass it as a
command-line argument — argv is exposed in shell history and process
listings on any shared or logged system.

## Symptoms

### Envelope stuck in `processing`
Documents are still being fetched and prepared. Almost always an unreachable
document URL. Check: does every document URL return 200 to an anonymous request,
and is each file a valid PDF or DOCX?

### No webhook arrived
There is **no webhook-delivery log** on any surface — this is a known gap. Split
the question in two: did the event happen (`GET /envelopes/{id}/events`), and is
your endpoint reachable from the internet? Test and live endpoints are separate;
a test envelope never notifies a live endpoint.

### Recipient never got the email
In **test mode no email is ever sent** — that is by design. Read what would have
been sent with `list_emails`, then `get_email`. In live mode, look for
`recipient.soft_bounced` / `recipient.hard_bounced` events.

### Ceremony link does not work
Links are single-recipient and expire. For `email_link` recipients the link *is*
the authentication, so it is never returned by the API in live mode — only the
test-mode email log exposes it.

### Deliverable missing after completion
Check for a `deliverable.generated` event, then `GET /envelopes/{id}/deliverables`.

### 422 on create
See `references/errors.md` for the response shape and the most common cause.
Check the exact schema with `search_documentation` (MCP) or the OpenAPI spec at
`https://api.signatureapi.com/openapi.json`.

## References

- `references/errors.md` — HTTP status codes and what they mean here
