---
name: signatureapi-integrate
description: "SignatureAPI integration reference. Use when adding electronic signatures to an application, sending a document for signature, building or changing a signing flow, or wiring up SignatureAPI webhooks."
---

# Integrate SignatureAPI

For diagnosing an integration that already exists, use `signatureapi-diagnose` instead.

## Access

**MCP first.** The SignatureAPI MCP server at `https://mcp.signatureapi.com/mcp`
is the primary interface: `create_envelope`, `get_envelope`, `list_envelopes`,
`cancel_envelope`, `delete_envelope`, `mint_upload_url`, `list_emails`,
`get_email`, `search_documentation`.

When MCP cannot do something, fall back — REST first, dashboard second — and
report the gap: print a block naming the operation and the fallback used, and
point the user at https://github.com/signatureapi/skills/issues/new. Known gaps
today: no events tool (use REST `GET /envelopes/{id}/events`), and no webhook
registration or delivery log anywhere outside the dashboard.

REST fallback: `https://api.signatureapi.com/v1`, header `X-API-Key`. Test keys
start with `key_test_`. **This skill works in test mode only.**

Install this skill's one dependency once, then check your setup:

    npm i                              # inside this skill directory
    node scripts/check-setup.mjs

## Orient in this codebase first

Before writing anything, find where signing belongs here. Read
`references/brownfield-placement.md` for the questions to ask, the signals to
grep for, and the two mistakes that are easy to make.

## Build

1. **Get a document URL.** Documents are referenced by URL. For a throwaway
   test document, `node scripts/make-test-document.mjs` uploads one and returns
   its URL — start here rather than improvising a PDF or an upload flow. For a
   file of your own, `POST /uploads` with the raw bytes and a `Content-Type`
   header (`application/pdf`,
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, or
   `image/png`, max 5 MB) returns a `url` valid for 24 hours — or use the MCP
   tool `mint_upload_url`.
2. **Create the envelope.** Print the minimum viable body with
   `node scripts/create-test-envelope.mjs --dry-run` and adapt it. The
   recipient defaults to `custom` authentication so the Verify step below
   never needs an email lookup — pass `--auth email_link` for the API's own
   default (what production recipients typically use), or `--auth
   email_code`. `references/verification-loop.md` explains the tradeoffs,
   including why `custom` is the wrong choice for a real recipient. Every
   place's `recipient_key` must match a recipient's `key`. Read
   `references/places.md` for how places bind to a document. Then create it
   for real: re-run the same command without `--dry-run`, or call the MCP
   tool `create_envelope` with the adapted body.
3. **Handle events.** A test-mode webhook endpoint is registered in the
   dashboard, which is also where its signing secret is issued — see
   `references/webhooks.md`. Run `node scripts/webhook-receiver.mjs` for a
   local receiver to point it at. Handle at least `envelope.completed`. Full
   event list and the local-dev alternative in `references/webhooks.md`.
4. **Persist the envelope id** against whatever domain object motivated the
   signature.

Query the spec rather than reading docs pages — the create-envelope page is
~108 KB:

    node scripts/openapi-explore.mjs schema Envelope
    node scripts/openapi-explore.mjs path post /envelopes

## Verify

The integration is done when a test-mode envelope has reached `completed` and
you have observed the completion event.

Both branches below get the ceremony link straight from the create response —
`node scripts/create-test-envelope.mjs`'s default `custom` authentication
returns `recipients[].ceremony.url` immediately, with no outstanding
challenge, so neither branch needs an email lookup. `email_link` (the API's
own default and what production envelopes typically use) still returns
`ceremony.url` as `null` — reach that link via `list_emails` → `get_email`
instead. Full detail, including why `custom` must not be reused for a
production recipient: `references/verification-loop.md`.

**Branch A (default).** Hand the link to the user and wait for them to
complete it.

**Branch B (only with explicit consent).** If the user asks you to complete
the ceremony yourself:

    node scripts/complete-ceremony.mjs --envelope <envelope id> --url <ceremony url> --i-consent

Either branch, confirm with:

    node scripts/watch-events.mjs --envelope <envelope id>

Full detail on both branches: `references/verification-loop.md`.

## Scripts

| Script | Does |
| --- | --- |
| `scripts/check-setup.mjs` | Credentials, mode and reachability |
| `scripts/openapi-explore.mjs` | Query the spec: `paths`, `path <method> <path>`, `schema <name>` |
| `scripts/make-test-document.mjs` | Build and upload a throwaway test PDF |
| `scripts/create-test-envelope.mjs` | Print or create a minimum viable test envelope (`--auth custom\|email_link\|email_code`, default `custom`) |
| `scripts/watch-events.mjs` | Poll events until the envelope reaches a terminal status |
| `scripts/webhook-receiver.mjs` | Local receiver that prints arriving events |
| `scripts/complete-ceremony.mjs` | Branch B browser walk (consent-gated) |

Every script prints JSON. Failures are `{"ok": false, "code", "message", "next": [...]}` —
`next` is the list of commands to run.

## References

- `references/places.md` — place types and how they bind to a document
- `references/webhooks.md` — event list and handler shape
- `references/brownfield-placement.md` — where signing belongs in an existing codebase
- `references/verification-loop.md` — both verification branches in full

## Vocabulary

An **envelope** holds **documents** and **recipients**. **Places** are interactive
regions on a document bound to a recipient. Each recipient signs through a
**ceremony**. Completion produces a **deliverable** — signed documents plus an
audit log.
