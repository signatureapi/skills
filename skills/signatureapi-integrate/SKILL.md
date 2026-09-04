---
name: signatureapi-integrate
description: "SignatureAPI integration reference. Use when adding electronic signatures to an application, sending a document for signature, building or changing a signing flow, wiring up SignatureAPI webhooks, or building a signing product or platform ('a platform like DocuSign', a self-serve signing tool) — the Intake section makes you ask and get a design approved before writing that code. The deliverable is application code calling the REST API; MCP and the bundled scripts are the agent's own tools for proving the flow. Covers even a seemingly simple task like creating a single envelope, since test-versus-live mode and place positioning carry gotchas. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
inputs:
  - name: SIGNATUREAPI_KEY
    required: true
---

# Integrate SignatureAPI

## When to reach for something else

- **Diagnosing an integration that already exists** — a stuck envelope, a
  missing webhook, a failed ceremony — belongs to `signatureapi-diagnose`.
- **A webhook that is not a SignatureAPI webhook** belongs to whatever sent
  it; this skill's webhook guidance is specific to SignatureAPI's event
  shapes and signing secret.
- **A different e-signature vendor** (DocuSign, Dropbox Sign, Adobe Sign,
  etc.) needs that vendor's own docs — see the retrieval-over-memory note
  above; this skill's schema and semantics are SignatureAPI-specific.
- **A project with no SignatureAPI credentials present** has not yet
  decided to integrate SignatureAPI — confirm that first rather than
  running `check-setup.mjs` against a key that doesn't exist.

## Two surfaces — keep them apart

**What the application calls: the REST API.** The integration you deliver is
code in this codebase, written in its own language with its own HTTP client,
calling `https://api.signatureapi.com/v1` with the `X-API-Key` header. There
is no SDK. The application must never depend on the MCP server or on this
skill's scripts — both exist for you while you work, not for the app at
runtime. Test keys start with `key_test_`. **This skill works in test mode
only.**

**What you use while working: MCP, the spec, and the scripts here.** The
SignatureAPI MCP server at `https://mcp.signatureapi.com/mcp` is your first
tool for inspecting and exercising the API as you build and verify:
`create_envelope`, `get_envelope`, `list_envelopes`, `cancel_envelope`,
`delete_envelope`, `mint_upload_url`, `list_emails`, `get_email`,
`search_documentation`. `get_envelope` takes `envelope_id`, not `id`. Reach
for it before hand-writing a request. When MCP cannot do something, fall
back — REST first, dashboard second — and report the gap: print a block
naming the operation and the fallback used, and point the user at
https://github.com/signatureapi/skills/issues/new. Known gaps today: no
events tool (use REST `GET /envelopes/{envelopeId}/events`), and no webhook
registration or delivery log anywhere outside the dashboard.

## Facts come from the spec, not from this file

The published OpenAPI spec, `https://spec.signatureapi.com/openapi.yaml`, is
the source of truth for every field name, enum value, event name, path and
limit. This skill inlines concepts, one worked flow and the gotchas the spec
cannot express; where it names an identifier and the spec disagrees, **the
spec wins**. Before writing a request body or a handler, query the spec
rather than reading docs pages (the create-envelope page alone is ~108 KB):

    node scripts/openapi-explore.mjs paths [filter]
    node scripts/openapi-explore.mjs path post /envelopes
    node scripts/openapi-explore.mjs schema Place
    node scripts/openapi-explore.mjs webhooks

`search_documentation` (MCP) answers the same questions in prose, and every
docs page has a Markdown twin at `https://signatureapi.com/<slug>.md`.

`SIGNATUREAPI_KEY` is read from the environment only. Never pass it as a
command-line argument — argv is exposed in shell history and process
listings on any shared or logged system.

`SIGNATUREAPI_BASE_URL` (default `https://api.signatureapi.com/v1`) and
`SIGNATUREAPI_SPEC_URL` (default `https://spec.signatureapi.com/openapi.yaml`,
read by `openapi-explore.mjs`) can override where these scripts point. Set
either only to a host you trust: every script sends `SIGNATUREAPI_KEY` as
the `X-API-Key` header to whatever host is configured, with no host
allowlist to catch a typo or a compromised value.

Install this skill's one dependency once, then check your setup:

    npm i                              # inside this skill directory
    node scripts/check-setup.mjs

## Intake — classify before you build

Before Orient and Build, classify the request and say which class it is:

- **Narrow change to an existing flow** — one more place on a document, a
  different authentication method, an extra event handled, a bug fixed:
  proceed to Orient and Build.
- **A new signing flow, a new product surface, or "a platform like X"** —
  send-for-signature in an app that has none, an embedded signing step, a
  self-serve tool where users upload and send, anything described by naming
  another e-signature vendor: **stop**. Ask, present a design, get a yes,
  then build.

"Build me a DocuSign" names a product, not a design. Each answer below
changes the code you would write, and most cannot be read from the codebase.
Ask them in **one message**, only the ones the request leaves open, in this
order:

1. **Document source** — user upload, a PDF the application generates, or a
   DOCX template merged with `data` at send time?
2. **How places are defined** — `fixed_positions` in code, `[[key]]`
   placeholders in the file, template fields, or a UI where users draw
   them? The last needs page rendering and upload structure inspection
   before any place can be positioned, and is the largest part of a
   platform.
3. **Recipients** — who acts, in what order (`sequential` or `parallel`
   `routing`), and how each is authenticated (`email_link`, `email_code`,
   `custom`, `identity_verification`)?
4. **Where the ceremony happens** — an emailed link, or embedded in the app
   (`embeddable_in`)? Where does the signer land afterwards (`redirect_url`)?
5. **On `envelope.completed`** — what does the application do, and where do
   the signed documents and audit log (the deliverable) go?
6. **Rollout** — test mode only for now, or live as well? Who holds the live
   key?
7. **Multi-tenant sending** — every envelope under one sender, or under each
   customer's own name and email?

Then present a short design — the shape from `references/product-shapes.md`
that fits, the endpoint sequence the application will call, the events it
handles, what it persists — and get an explicit yes before writing code. A
design corrected in review costs a message; a flow corrected after it ships
costs a migration.

### Worked example: the one message

> Before I build this, seven answers decide the design. Tell me what you
> know; I'll propose the rest.
>
> 1. Documents: do users upload PDFs, does your app generate them, or do
>    you have DOCX templates to fill with data?
> 2. Signature fields: positions you fix in code, placeholders written into
>    the files, or a UI where your users draw them?
> 3. Signers: one or several per document; in a fixed order or all at once;
>    is an emailed link enough, or should signers already be logged in to
>    your app when they sign?
> 4. Signing: from an emailed link, or inside your app's pages? Where should
>    the signer land afterwards?
> 5. When everything is signed: what should the app do, and where do the
>    signed PDF and the audit log get stored?
> 6. Test mode only for now, or live as well?
> 7. Does every envelope go out in your name, or in each of your customers'
>    names?

### Red flags

| Thought | Reality |
| --- | --- |
| "This is obvious, I'll start with the envelope call." | The envelope call is the smallest part. Document source, place definition and the completion handler are where a wrong guess costs days. Ask. |
| "They said 'like X', so I'll copy X's data model." | X's concepts (templates, envelopes-as-drafts, tabs) are not SignatureAPI's. Design from this API's objects, or the code fights the API. |
| "I'll ask one question at a time." | Seven round trips is how users stop answering. One message, only the open questions. |
| "The codebase answers these." | Orient answers *where* signing belongs. Intake answers *what* to build. Both, in this order. |
| "I'll pick sensible defaults and note them." | `custom` authentication, a `[[key]]` placeholder and "store the PDF in S3" are each a product decision the user has not made. Propose them in the design; do not build on them unapproved. |
| "It's a platform, I'll build all three shapes." | A self-serve platform is one shape. Build the one the user confirmed, and its verification loop, before adding another. |

## Orient in this codebase first

Before writing anything, find where signing belongs here. Read
`references/brownfield-placement.md` for the questions to ask, the signals to
grep for, and the two mistakes that are easy to make.

## Build

Steps 1–3 prove the flow against the test API using your own tools. Step 4 is
the deliverable: the same flow written into the application.

1. **Get a document URL.** Documents are referenced by URL. For a throwaway
   test document, `node scripts/make-test-document.mjs` uploads one and returns
   its URL — start here rather than improvising a PDF or an upload flow. For a
   file of your own, `POST /uploads` with the raw bytes and a `Content-Type`
   header returns a temporary `url` — accepted content types, the size limit
   and the URL's lifetime are in `node scripts/openapi-explore.mjs path post
   /uploads` — or use the MCP tool `mint_upload_url`.
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
4. **Write it into the application.** Using the codebase's own HTTP client
   and conventions (found in Orient above), implement: the `POST /envelopes`
   call with the body you proved in step 2, triggered where the domain
   action happens; the webhook handler from step 3 mounted on the app's
   existing inbound-HTTP path; and **persistence of the envelope id** against
   the domain object that motivated the signature. Read the key from the
   app's configuration, never hard-code it. Do not copy this skill's scripts
   into the app, and do not make the app call the MCP server — re-decide the
   recipient's authentication for production too (see
   `references/verification-loop.md`).

## Verify

The integration is done when a test-mode envelope has reached `completed` and
you have observed the completion event.

Both branches below get the ceremony link straight from the create response —
`node scripts/create-test-envelope.mjs`'s default `custom` authentication
returns `recipients[].ceremony.url` immediately, with no outstanding
challenge, so neither branch needs an email lookup. `email_link` (the API's
own default and what production envelopes typically use) still returns
`ceremony.url` as `null` — reach that link via `list_emails` → `get_email`
instead, but that link is for Branch A only; Branch B verifies envelopes
whose ceremony URL the API itself returns, which means a `custom`-auth
envelope. Full detail, including why `custom` must not be reused for a
production recipient: `references/verification-loop.md`.

**Branch A (default).** Hand the link to the user and wait for them to
complete it. This works for every place type and every authentication
method, including `email_link`.

**Branch B.** If the user asks you to complete the ceremony yourself (needs
Playwright — see Scripts table below):

    node scripts/complete-ceremony.mjs --envelope <envelope id>

The browser walk completes envelopes whose places are signature places —
what `create-test-envelope.mjs` produces. For an envelope containing
`initials` or any other place type, use Branch A instead; see
`references/verification-loop.md` for why. No flag gates this branch, and
none should be added: an agent runs
non-interactively, so any check a flag could enforce is one the agent could
already satisfy on its own initiative just by passing it — a flag shaped
like a consent gate would invite the belief that something is being
enforced when nothing is. What actually keeps this branch safe is
structural — the script cannot run against a live key at all, because
`requireTestKey` has no bypass path.

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

Every script prints JSON. Failures are `{"ok": false, "code", "message", "next": [...]}` —
`next` is the list of commands to run.

Branch B needs Playwright, which is deliberately not one of this skill's own
dependencies (it's heavy, and only Branch B needs it) — install it before
starting that walk: `npm install --save-dev playwright && npx playwright
install chromium`.

## References

- `references/places.md` — how places bind to a document (types come from the spec)
- `references/webhooks.md` — registering an endpoint and the handler shape
- `references/brownfield-placement.md` — where signing belongs in an existing codebase
- `references/verification-loop.md` — both verification branches in full

## Vocabulary

An **envelope** holds **documents** and **recipients**. **Places** are interactive
regions on a document bound to a recipient. Each recipient signs through a
**ceremony**. Completion produces a **deliverable** — signed documents plus an
audit log.
