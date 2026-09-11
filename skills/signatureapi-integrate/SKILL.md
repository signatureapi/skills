---
name: signatureapi-integrate
description: "Use when building or changing an integration with SignatureAPI: creating envelopes, placing signature fields, wiring up SignatureAPI webhooks, or verifying a signing flow end to end. Use it even for a seemingly simple task like creating a single envelope, and in any host, including one with no repository access. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
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
- **A project with no SignatureAPI credentials present.** Ask whether the
  user has chosen SignatureAPI. If yes, get a test key (see Setup). If not,
  stop. Do not run `check-setup.mjs` against a key that does not exist.

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
first to inspect and exercise the API as you build and verify. Use a tool
before hand-writing a request. Its tools, by job:

- Session: `whoami`.
- Documents: `mint_upload_url` or `upload_file` (one per host),
  `inspect_upload`.
- Envelopes: `create_envelope`, `get_envelope`, `list_envelopes`,
  `cancel_envelope`, `delete_envelope`.
- Recipients: `resend_request`, `replace_recipient`, `create_ceremony`.
- Watching: `list_events` (with `wait_seconds`), `get_deliverables`,
  `list_emails`, `get_email`.
- Webhooks: `list_webhooks`, `create_webhook`, `update_webhook`,
  `test_webhook`, `list_webhook_attempts`, `delete_webhook`.
- Docs: `search_documentation` (a `page` argument returns one docs page in
  full).

`get_envelope` takes `envelope_id`, not `id`. A missing MCP tool does not
prove that a same-purpose REST operation exists. Confirm the exact method
and path first:

    node scripts/openapi-explore.mjs operation <method> <path>

Use the REST fallback only when that inspection succeeds. When it fails,
stop instead of guessing another path. Report the missing operation and
point the user at https://github.com/signatureapi/skills/issues/new. Test
email inspection is an MCP or dashboard capability, not an established
public REST fallback.

**MCP mode is per session, not per call.** Call `whoami` first. The session
acts in live mode when `modes.live` is true and the account is active.
Otherwise it acts in test mode. Envelope creation and every listing follow
the session mode. Reads by id (`get_envelope`, `list_events` with an
`envelope_id`, `get_deliverables`) work on either mode. Webhook tools take a
`mode` argument. **Never call `create_envelope` until `whoami` has shown
the session is in test mode.** A live envelope emails a real person and is
binding. When `whoami` is not listed, or shows a live session, create test
envelopes with the scripts instead: they run with your `key_test_` key and
cannot reach live mode. Then read the test envelope by id through MCP. If
a `create_envelope` response ever shows `mode: live`, cancel it at once and
tell the user what was sent.

## Know your host

The steps below assume a coding agent with a repository, a filesystem and
a shell. Check what you actually have, and adapt:

- **A tool that takes an attached file** (`upload_file`) → use it for
  documents. **A tool that returns an upload URL** (`mint_upload_url`) →
  send the bytes to that URL yourself. Exactly one of the two is listed.
- **A writable project filesystem** → the user puts the test key in the
  project's gitignored env file, as Setup describes, and the scripts read
  it from there. **No filesystem** → do not ask for the key and do not
  print it; every MCP call is already authenticated.
- **A shell** → the bundled scripts run. **No shell** → the MCP tools cover
  the same steps: `whoami`, an upload tool, `create_envelope`, the webhook
  tools, `list_events`, `get_deliverables`.
- **No repository access** (a chat host such as ChatGPT) → design the flow
  with `signatureapi-architecture`. Prove it end to end with the MCP tools
  in test mode. Hand the user the design document and the proven request
  bodies. Say plainly that the application code is written in a
  coding environment with the repository open. Do not pretend to have
  written it.

## Facts come from the spec, not from this file

The published OpenAPI spec is `https://spec.signatureapi.com/openapi.yaml`.
It is the source of truth for every field name, enum value, event name, path
and limit. This skill inlines concepts, one worked flow and the gotchas the
spec cannot express. Where this skill names an identifier and the spec
disagrees, **the spec wins**. Query the spec before writing a request body or
a handler. Do not read the docs pages for this; the create-envelope page
alone is about 108 KB.

    node scripts/openapi-explore.mjs operations [filter]
    node scripts/openapi-explore.mjs operation post /envelopes
    node scripts/openapi-explore.mjs check-request get '/envelopes/<id>/deliverables?limit=20'
    node scripts/openapi-explore.mjs schema Place.PlaceInput
    node scripts/openapi-explore.mjs webhooks

The explorer prints a compact Markdown contract view. Add `--json` only
when another program needs structured output. `check-request` checks a
candidate locally and never sends it to the API.

`search_documentation` (MCP) answers the same questions in prose. Every docs
page has a Markdown twin at `https://signatureapi.com/<slug>.md`.

## Setup

Get a test key into the project without it crossing the chat. No MCP tool
returns a credential: a tool result lands in the transcript, and the model,
not a person, decides to read it. The user fetches secrets from the
dashboard.

1. Call `whoami`. Note the account, and whether a test key already exists
   (`test_api_key.exists`).
2. Ask the user to create or copy a test key (`key_test_…`) on the
   dashboard's API keys page, `https://dashboard.signatureapi.com/settings/api-keys`,
   and to put it in the project's gitignored env file as `SIGNATUREAPI_KEY`.
   Say which file and which variable name. Never ask them to paste the key
   into the chat. If you come across it, never echo it or write it into
   code, a commit, a log, or a tool argument.
3. Install this skill's one dependency, then check the setup:

        npm i                              # inside this skill directory
        node scripts/check-setup.mjs

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

## Start from the design

Classify the request first.

- **A narrow change to an existing flow.** One more place, one more event
  handled, a bug fixed. Go to Orient and Build.
- **A change to who signs, how they authenticate, or who receives email.**
  Update the design document first, with the user's yes, then build. The
  `signatureapi-architecture` skill owns those decisions.
- **Anything else.** A new signing flow, a new product surface, "a platform
  like X". The design document must exist in this repository and the user
  must have approved it. It lives at `docs/signatureapi-integration.md`, or
  that file points to where it lives. If it does not exist, stop. Run the
  `signatureapi-architecture` skill (it ships in the same install) and come
  back with the approved design. Do not ask the design questions here. Do
  not build without the file.

Build reads the design file. Each decision there has a For you line the
user approved and a Technical decision line that is yours. Build from the
technical lines: the document input path, the places, the recipients, the
authentication, the ceremony delivery, the completion handling and the
rollout. Do not guess any of them. Use the design's own names for the
user's concepts, and talk to the user in those names. SignatureAPI terms belong at the API
boundary; the design document's vocabulary section maps one to the other.
The common product shapes the design may name are described in
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
   flow. In the application, the preferred source is a signed or public
   URL to a file in the app's own storage; the design says which. While
   you work, use whichever upload tool your client lists. `upload_file`
   takes the file; `mint_upload_url` returns a URL to send the bytes to. Or
   call `POST /uploads` with the raw bytes and a `Content-Type` header. Each
   returns a temporary `url`. Accepted content types, the size limit and
   the URL's lifetime are in
   `node scripts/openapi-explore.mjs operation post /uploads`.
   Inspect the source document and list its bindings before defining places
   or template data. PDF and DOCX support different binding syntax.
   `references/places.md` gives the classification and reconciliation step.
   Use `inspect_upload` when available to confirm what the service detected.
2. **Create the envelope.** Print the minimum viable body with
   `node scripts/create-test-envelope.mjs --dry-run` and adapt it. The
   recipient defaults to `custom` authentication, so the Verify step below
   never needs an email lookup. Pass `--auth email_link` for the API's own
   default, which is what production recipients typically use. Or pass
   `--auth email_code`. `authentication` is an ordered array, so `--auth`
   also takes a comma-separated list. `--auth email_link,email_code` keeps
   SignatureAPI sending the invitation email and adds an emailed code as a
   second step. The application sends no email of its own.
   `references/verification-loop.md` explains the tradeoffs, including which
   method delivers the ceremony URL and why `custom` is the wrong choice for
   a real recipient. Every place's `recipient_key` must match a recipient's `key`.
   Reconcile every document binding as `references/places.md` describes.
   Fixed positions do not disable bindings already embedded in the file.
   Keep generic fixture titles and messages plain. An account may reject
   URL-like, phone-like, or numeric date content in `title` and `message`
   unless its anti-phishing content capability is enabled. If the product
   needs that content, record account enablement as a prerequisite instead
   of silently removing it. Then create the envelope: re-run without
   `--dry-run`. In a test-mode MCP session, `create_envelope` works too.
3. **Handle events.** Register a test-mode webhook endpoint with
   `create_webhook`. Its signing secret is not returned. The tool names the
   dashboard page that shows it (`signing_secret_dashboard_url`). Ask the
   user to copy it into the project's env file as
   `SIGNATUREAPI_WEBHOOK_SECRET`, the same way as the API key. Run `node scripts/webhook-receiver.mjs` for a local receiver to point it
   at. Send a sample delivery with `test_webhook`, then confirm a 2xx with
   `list_webhook_attempts`. Handle at least `envelope.completed`. The full
   event list, the handler shape and the local-dev alternative are in
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

Provider completion is proven when the test envelope reaches `completed`,
the completion event exists, and genuine deliverable bytes are retrieved.
Application acceptance also requires those exact bytes to pass the
retrieval, admission, and storage path from the approved design.

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

Either branch, confirm with `list_events`. Pass the `envelope_id` and
`wait_seconds: 20`. The server re-reads the events every two seconds and
returns as soon as a new one arrives. When the response says `timed_out`,
nothing new arrived yet; call it again. Do not sleep and poll by hand. Then
call `get_deliverables` for the signed PDF and audit log with fresh URLs.
Before a REST fallback, check its concrete path and query values with
`check-request`. Without MCP, the event watcher uses REST:

    node scripts/watch-events.mjs --envelope <envelope id>

Full detail on both branches: `references/verification-loop.md`.

## Scripts

| Script | Does |
| --- | --- |
| `scripts/check-setup.mjs` | Credentials, mode and reachability |
| `scripts/openapi-explore.mjs` | Read the API contract: `operations`, `operation`, `check-request`, `schema`, `webhooks` |
| `scripts/make-test-document.mjs` | Build and upload a throwaway test PDF |
| `scripts/create-test-envelope.mjs` | Print or create a minimum viable test envelope (`--auth` takes one or a comma-separated list of `custom`, `email_link`, `email_code`; default `custom`) |
| `scripts/watch-events.mjs` | REST fallback for `list_events`: poll until the envelope reaches a terminal status (`--once` for a single check) |
| `scripts/webhook-receiver.mjs` | Local receiver that prints arriving events |
| `scripts/complete-ceremony.mjs` | Branch B browser walk (test mode only, no bypass) |

Operational scripts print JSON. Their failures contain `code`, `message`,
and `next`. The contract explorer prints Markdown by default and accepts
`--json`. It labels local findings and states that no API request was sent.

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
