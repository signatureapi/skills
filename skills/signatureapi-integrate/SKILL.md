---
name: signatureapi-integrate
description: "SignatureAPI integration reference. Use when building or changing an integration against an approved design: creating envelopes, placing signature fields, wiring up SignatureAPI webhooks, or verifying a signing flow end to end. Use it for a narrow change to an existing flow directly. For a new signing flow, a new product surface, or 'a platform like DocuSign', it requires docs/signatureapi-integration.md, written by the signatureapi-architecture skill. The deliverable is application code calling the REST API. MCP and the bundled scripts are the agent's own tools for proving the flow. Covers even a seemingly simple task like creating a single envelope, since test-versus-live mode and place positioning carry gotchas. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
inputs:
  - name: SIGNATUREAPI_KEY
    required: true
---

# Integrate SignatureAPI

## When to reach for something else

- **Deciding how an app should use SignatureAPI** belongs to
  `signatureapi-architecture`. It writes the design document this skill
  requires.
- **Diagnosing an integration that already exists** (a stuck envelope, a
  missing webhook, a failed ceremony) belongs to `signatureapi-diagnose`.
- **A webhook that is not a SignatureAPI webhook** belongs to whatever sent
  it. This skill's webhook guidance covers SignatureAPI's event shapes and
  signing secret only.
- **A different e-signature vendor** (DocuSign, Dropbox Sign, Adobe Sign,
  etc.) needs that vendor's own docs. This skill's schema and semantics are
  SignatureAPI-specific.
- **A project with no SignatureAPI credentials present** has not yet decided
  to integrate SignatureAPI. Confirm that first. Do not run
  `check-setup.mjs` against a key that does not exist.

## Two surfaces — keep them apart

**What the application calls: the REST API.** The integration you deliver is
code in this codebase. It uses the codebase's own language and HTTP client.
It calls `https://api.signatureapi.com/v1` with the `X-API-Key` header. There
is no SDK. The application must never depend on the MCP server or on this
skill's scripts. Both exist for you while you work, not for the app at
runtime. Test keys start with `key_test_`. **This skill works in test mode
only.**

**What you use while working: MCP, the spec, and the scripts here.** The
SignatureAPI MCP server is at `https://mcp.signatureapi.com/mcp`. Use it
first to inspect and exercise the API as you build and verify. Its tools:
`create_envelope`, `get_envelope`, `list_envelopes`, `cancel_envelope`,
`delete_envelope`, `mint_upload_url`, `list_emails`, `get_email`,
`search_documentation`. `get_envelope` takes `envelope_id`, not `id`. Use a
tool before hand-writing a request. When MCP cannot do something, fall
back: REST first, dashboard second. Then report the gap. Print a block
naming the operation and the fallback used, and point the user at
https://github.com/signatureapi/skills/issues/new. Known gaps today: no
events tool (use REST `GET /envelopes/{envelopeId}/events`), and no webhook
registration or delivery log anywhere outside the dashboard.

## Facts come from the spec, not from this file

The published OpenAPI spec is `https://spec.signatureapi.com/openapi.yaml`.
It is the source of truth for every field name, enum value, event name, path
and limit. This skill inlines concepts, one worked flow and the gotchas the
spec cannot express. Where this skill names an identifier and the spec
disagrees, **the spec wins**. Query the spec before writing a request body or
a handler. Do not read the docs pages for this; the create-envelope page
alone is about 108 KB.

    node scripts/openapi-explore.mjs paths [filter]
    node scripts/openapi-explore.mjs path post /envelopes
    node scripts/openapi-explore.mjs schema Place.PlaceInput
    node scripts/openapi-explore.mjs webhooks

`search_documentation` (MCP) answers the same questions in prose. Every docs
page has a Markdown twin at `https://signatureapi.com/<slug>.md`.

Read `SIGNATUREAPI_KEY` from the environment only. Never pass it as a
command-line argument. Argv is exposed in shell history and process listings
on any shared or logged system.

Two variables override where these scripts point: `SIGNATUREAPI_BASE_URL`
(default `https://api.signatureapi.com/v1`) and `SIGNATUREAPI_SPEC_URL`
(default `https://spec.signatureapi.com/openapi.yaml`, read by
`openapi-explore.mjs`). Set either only to a host you trust. Every script
sends `SIGNATUREAPI_KEY` as the `X-API-Key` header to whatever host is
configured. There is no host allowlist to catch a typo or a compromised
value.

Install this skill's one dependency once, then check your setup:

    npm i                              # inside this skill directory
    node scripts/check-setup.mjs

## Start from the design

Classify the request first.

- **A narrow change to an existing flow.** One more place, a different
  authentication method, one more event handled, a bug fixed. Go to Orient
  and Build.
- **Anything else.** A new signing flow, a new product surface, "a platform
  like X". `docs/signatureapi-integration.md` must exist in this repository
  and the user must have approved it. If it does not exist, stop. Run the
  `signatureapi-architecture` skill (it ships in the same install) and come
  back with the approved design. Do not ask the design questions here. Do
  not build without the file.

Build reads the design file. Take the document input path, the places, the
recipients, the authentication, the ceremony delivery, the completion
handling and the rollout from it. Do not guess any of them. The three
product shapes the design names are described in
`../signatureapi-architecture/references/product-shapes.md`.

## Orient in this codebase first

Before writing anything, find where signing belongs here. Read
`references/brownfield-placement.md`. It lists the questions to ask, the
signals to grep for, and the two mistakes that are easy to make.

## Build

Steps 1–3 prove the flow against the test API using your own tools. Step 4 is
the deliverable: the same flow written into the application.

1. **Get a document URL.** Documents are referenced by URL. For a throwaway
   test document, run `node scripts/make-test-document.mjs`. It uploads one
   and returns its URL. Start here; do not improvise a PDF or an upload
   flow. For a file of your own, call `POST /uploads` with the raw bytes and
   a `Content-Type` header. It returns a temporary `url`. Accepted content
   types, the size limit and the URL's lifetime are in
   `node scripts/openapi-explore.mjs path post /uploads`. Or use the MCP
   tool `mint_upload_url`.
2. **Create the envelope.** Print the minimum viable body with
   `node scripts/create-test-envelope.mjs --dry-run` and adapt it. The
   recipient defaults to `custom` authentication, so the Verify step below
   never needs an email lookup. Pass `--auth email_link` for the API's own
   default, which is what production recipients typically use. Or pass
   `--auth email_code`. `references/verification-loop.md` explains the
   tradeoffs, including why `custom` is the wrong choice for a real
   recipient. Every place's `recipient_key` must match a recipient's `key`.
   Read `references/places.md` for how places bind to a document. Then
   create it for real: re-run the same command without `--dry-run`, or call
   the MCP tool `create_envelope` with the adapted body.
3. **Handle events.** Register a test-mode webhook endpoint in the
   dashboard. The dashboard also issues its signing secret; see
   `references/webhooks.md`. Run `node scripts/webhook-receiver.mjs` for a
   local receiver to point it at. Handle at least `envelope.completed`. The
   full event list and the local-dev alternative are in
   `references/webhooks.md`.
4. **Write it into the application.** Use the codebase's own HTTP client and
   conventions, found in Orient above. Implement three things. First, the
   `POST /envelopes` call with the body you proved in step 2, triggered where
   the domain action happens. Second, the webhook handler from step 3,
   mounted on the app's existing inbound-HTTP path. Third, **persistence of
   the envelope id** against the domain object that motivated the signature.
   Read the key from the app's configuration; never hard-code it. Do not
   copy this skill's scripts into the app. Do not make the app call the MCP
   server. Re-decide the recipient's authentication for production too (see
   `references/verification-loop.md`).

## Verify

The integration is done when a test-mode envelope has reached `completed` and
you have observed the completion event.

Both branches below get the ceremony link straight from the create response.
`node scripts/create-test-envelope.mjs` defaults to `custom` authentication,
which returns `recipients[].ceremony.url` immediately with no outstanding
challenge. So neither branch needs an email lookup. `email_link` is the API's
own default and what production envelopes typically use. It returns
`ceremony.url` as `null`. Reach that link via `list_emails` → `get_email`
instead. That link is for Branch A only. Branch B verifies envelopes whose
ceremony URL the API itself returns, which means a `custom`-auth envelope.
Full detail, including why `custom` must not be reused for a production
recipient: `references/verification-loop.md`.

**Branch A (default).** Hand the link to the user and wait for them to
complete it. This works for every place type and every authentication
method, including `email_link`.

**Branch B.** If the user asks you to complete the ceremony yourself (needs
Playwright — see the Scripts table below):

    node scripts/complete-ceremony.mjs --envelope <envelope id>

The browser walk completes envelopes whose places are signature places. That
is what `create-test-envelope.mjs` produces. For an envelope containing
`initials` or any other place type, use Branch A instead; see
`references/verification-loop.md` for why. No flag gates this branch, and
none should be added. An agent runs non-interactively. Any check a flag could
enforce is one the agent could satisfy on its own by passing it. A flag
shaped like a consent gate would suggest that something is enforced when
nothing is. What keeps this branch safe is structural: the script cannot run
against a live key at all, because `requireTestKey` has no bypass path.

Either branch, confirm with:

    node scripts/watch-events.mjs --envelope <envelope id>

Full detail on both branches: `references/verification-loop.md`.

## Scripts

| Script | Does |
| --- | --- |
| `scripts/check-setup.mjs` | Credentials, mode and reachability |
| `scripts/openapi-explore.mjs` | Query the spec: `paths`, `path <method> <path>`, `schema <name>`, `webhooks` |
| `scripts/make-test-document.mjs` | Build and upload a throwaway test PDF |
| `scripts/create-test-envelope.mjs` | Print or create a minimum viable test envelope (`--auth custom\|email_link\|email_code`, default `custom`) |
| `scripts/watch-events.mjs` | Poll events until the envelope reaches a terminal status (`--once` for a single check, no polling) |
| `scripts/webhook-receiver.mjs` | Local receiver that prints arriving events |
| `scripts/complete-ceremony.mjs` | Branch B browser walk (test mode only, no bypass) |

Every script prints JSON. Failures are `{"ok": false, "code", "message", "next": [...]}`.
`next` is the list of commands to run.

Branch B needs Playwright. It is deliberately not one of this skill's own
dependencies: it is heavy, and only Branch B needs it. Install it before
starting that walk: `npm install --save-dev playwright && npx playwright
install chromium`.

## References

- `references/places.md` — how places bind to a document (types come from the spec)
- `references/webhooks.md` — registering an endpoint and the handler shape
- `references/brownfield-placement.md` — where signing belongs in an existing codebase
- `references/verification-loop.md` — both verification branches in full

## Vocabulary

An **envelope** holds **documents** and **recipients**. **Places** are
interactive regions on a document bound to a recipient. Each recipient signs
through a **ceremony**. Completion produces a **deliverable**: signed
documents plus an audit log. The **design document** is
`docs/signatureapi-integration.md`, written by `signatureapi-architecture`.
