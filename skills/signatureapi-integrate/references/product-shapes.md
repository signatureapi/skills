# Product shapes

*Reference for the SignatureAPI signatureapi-integrate skill — test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

Three shapes cover most requests that reach the Intake gate. Each one lists
what the **application** calls (REST, in its own language), what **you** use
to prove it while you work (MCP tools and this skill's scripts — never a
runtime dependency of the app), the decisions Intake must settle before
building, and the two mistakes most likely in that shape.

Identifiers here are illustrations; the spec wins. Query it before writing a
body:

    node scripts/openapi-explore.mjs path post /envelopes
    node scripts/openapi-explore.mjs schema Ceremony.CeremonyInput

**Tool availability.** Tools marked *(v2)* are part of MCP tool surface v2
(SIG-1252) and may not be on the server you are connected to yet. Check the
tool list your client shows; when a *(v2)* tool is missing, use the REST
fallback named next to it and report the gap as SKILL.md describes. The
webhook tools (`list_webhooks`, `create_webhook`, `get_webhook_secret`,
`test_webhook`, `list_webhook_attempts`) are on the server when your client
lists them; otherwise register endpoints in the dashboard as
`references/webhooks.md` describes.

## Shape 1 — send-for-signature inside an existing application

The app already owns the document and the moment it should be signed (an
offer accepted, an order confirmed). Signing is a side effect of a domain
action, and the signer is usually outside the app.

**The application calls**

1. Get a document URL: a public URL it already serves, or `POST /uploads`
   with the file bytes and a `Content-Type` header, which returns a
   temporary `url`.
2. `POST /envelopes` with the document, the recipients (default
   `email_link` authentication, so SignatureAPI emails the signing link),
   places bound by `recipient_key`, and `metadata` carrying the app's own
   record id — it comes back on every event as `envelope_metadata`.
3. Persist the returned envelope `id` on the domain row.
4. Handle `envelope.completed` on the app's existing inbound-HTTP path, then
   `GET /envelopes/{envelopeId}/deliverables` and
   `GET /deliverables/{deliverableId}` to fetch the signed PDF and audit
   log, and store them where the app keeps documents.
5. For "the signer lost the email": the resend operation on the recipient
   (public REST from SIG-1252; internal before that — until then the
   dashboard resends). For "wrong person":
   `POST /recipients/{recipientId}/replace`.

**You prove it with**

- `whoami` *(v2)* to confirm account and mode; `get_test_api_key` *(v2)* to
  put a `key_test_` key into the project's env file without echoing it
  (fallback: the dashboard's API keys page, then `scripts/check-setup.mjs`).
- `scripts/make-test-document.mjs`, then `create_envelope` (or
  `scripts/create-test-envelope.mjs`).
- `list_events` *(v2)* with `wait_seconds` to watch `envelope.completed`
  arrive (fallback: `scripts/watch-events.mjs --envelope <id>`).
- `get_deliverables` *(v2)* to fetch the signed PDF and audit log with fresh
  URLs (fallback: the two deliverable GETs above).
- `list_webhook_attempts` to tell "the event fired" apart from "my handler
  never ran" (fallback: events plus the app's own logs).

**Decisions Intake must settle:** document source (app-generated vs upload),
placeholder vs `fixed_positions`, how many signers and whether `routing` is
`sequential`, what the app does on completion, where deliverables live, and
whether the sender is the account or a per-customer `sender`.

**Two mistakes**

- **Calling `POST /envelopes` inside the request the user is waiting on.**
  Creating the envelope belongs with the codebase's other non-blocking side
  effects (queue, job, domain event). See
  `references/brownfield-placement.md`.
- **Fetching the deliverable on `recipient.completed`.** The deliverable is
  generated after the envelope completes; handle `envelope.completed` (or
  `deliverable.generated`) and then fetch, and treat a `pending` or
  `processing` deliverable `status` as "not yet", not "missing".

## Shape 2 — embedded signing step

The signer is already logged in to the app, and signs inside it: the
ceremony renders in an iframe on the app's page, not from an emailed link.

**The application calls**

1. `POST /envelopes` as in Shape 1, with each embedded recipient's
   `ceremony` set to `custom` authentication (the app asserts it verified
   the signer — the `provider` and `data` values are written into the audit
   log, so make them true statements) and `embeddable_in` listing the app's
   origin. `redirect_url` is ignored for embedded ceremonies; the app learns
   the outcome from events instead.
2. Read `recipients[].ceremony.url` from the create response and render it
   in an iframe for that signer only, on a page the signer had to log in to
   reach.
3. Handle `recipient.completed` to advance the app's own flow for that
   signer, and `envelope.completed` for the whole envelope; fetch the
   deliverable as in Shape 1.
4. When a signer returns later and the link has expired or been revoked,
   `POST /recipients/{recipientId}/ceremonies` issues a new one; any
   previous ceremony for that recipient is revoked.

For a signer who is *not* logged in — a counterparty outside the app — do
not embed. Give them `email_link` (or `email_code`, or
`identity_verification`) and a standalone ceremony with `redirect_url`
pointing back at the app; SignatureAPI appends the outcome, the envelope id
and the recipient id as query parameters (the exact names are in the spec's
`Ceremony.RedirectUrl` description). `redirect_delay` controls how long the
completion screen shows first.

**You prove it with**

- `create_envelope` with a `custom` recipient, then open the returned
  ceremony URL in the app's page during development (`embeddable_in` set to
  the dev origin, never `['*']` in code that ships).
- `create_ceremony` *(v2)* to exercise re-issuing a link (fallback:
  `POST /recipients/{recipientId}/ceremonies` from a script).
- `list_events` *(v2)* or `scripts/watch-events.mjs` to see
  `recipient.completed` and `envelope.completed`.
- Branch B (`scripts/complete-ceremony.mjs`) works here because a `custom`
  ceremony has no outstanding challenge — see
  `references/verification-loop.md`.

**Decisions Intake must settle:** which recipients are in-app (embedded,
`custom`) and which are external (emailed), what the page does when the
iframe reports completion, and how the app maps its own user to the
recipient.

**Two mistakes**

- **Using `custom` authentication for a recipient the app did not
  authenticate.** It is an assertion in the audit log. External signers get
  `email_link` or stronger; see `references/verification-loop.md`.
- **Serving the ceremony URL to the wrong session.** The URL is the
  credential for a `custom` ceremony. Render it only to the logged-in user
  who is that recipient, never in a shared or cacheable response, and never
  store it anywhere a different user can read.

## Shape 3 — self-serve platform

The app's users bring their own documents, define where the fields go,
choose their signers, and send — the app is a signing product, and its
customers are the senders. This is the shape "a platform like X" usually
means, and the one with the most code outside SignatureAPI.

**The application calls**

1. `POST /uploads` with the user's file; keep the returned upload id and
   `url`. Read the upload's structure — page count, page sizes, any
   placeholders found (public REST from SIG-1252; SDK-only before that) —
   so the field-placement UI can render pages at the right aspect ratio and
   convert screen coordinates to PDF points, origin top-left.
2. Store the user's field layout as `fixed_positions` (`page`, `top`,
   `left`, `place_key`) plus the matching `places`, each bound to a
   recipient by `recipient_key`; or, for template-driven senders, let them
   upload a DOCX and supply `data`.
3. Per customer, either `POST /senders` once (email verification must
   complete before use) and pass their verified email as the envelope
   `sender`, or send everything under the account's default sender.
4. `POST /envelopes` when the user clicks send: their documents, their
   recipients (mostly `email_link`), their `routing`, `metadata` with the
   platform's own ids, and a `deliverable` configuration if the platform
   wants a `simple` or `standard` output or a password.
5. Handle the recipient events the platform's UI shows (`recipient.sent`,
   `recipient.viewed`, `recipient.completed`, `recipient.rejected`,
   `recipient.hard_bounced`) and `envelope.completed`; fetch deliverables as
   in Shape 1 and file them under the sending user.
6. Expose the recipient operations users expect: resend (see Shape 1 step
   5), `POST /recipients/{recipientId}/replace`, and
   `POST /envelopes/{envelopeId}/cancel`.

**You prove it with**

- `mint_upload_url` (or `scripts/make-test-document.mjs`), then
  `inspect_upload` *(v2)* to confirm the page count and sizes your UI will
  draw on (fallback: render the PDF locally and read its page boxes; do not
  guess).
- `create_envelope` with `fixed_positions`, then open the resulting
  document or a test render to confirm the fields landed where the UI
  showed them — coordinate bugs never surface in the create response.
- `list_events` *(v2)* / `scripts/watch-events.mjs` for the per-recipient
  events the UI depends on; `replace_recipient` and `resend_request`
  *(v2)* to exercise the repair paths (fallback: the replace REST call; the
  dashboard for resend).
- `list_webhooks`, `create_webhook`, `test_webhook` and
  `list_webhook_attempts` for the endpoint the platform registers, and
  `update_webhook` *(v2)* to point it elsewhere without recreating it.

**Decisions Intake must settle:** all seven Intake questions — this shape
has no defaults. In particular: whether users draw fields (a rendering and
coordinate-mapping UI) or the platform only supports placeholders and
templates; whether each customer sends under a verified `sender`; which
deliverable type and where it is stored per customer; and whether the
platform goes live with one live key or per-customer isolation.

**Two mistakes**

- **Placing fields on pages you never rendered.** A coordinate typed from a
  screenshot, or a page size assumed to be Letter, lands the field on the
  wrong spot or the wrong page. Read the structure, render the page,
  convert coordinates, then verify on the generated document.
- **Modelling the platform on another vendor's objects.** Templates as a
  first-class server object, envelopes as editable drafts and per-tab field
  types do not exist here. An envelope is created complete and immutable
  except for `label`; drafts and templates are the platform's own data, and
  become an envelope only at send time.
