# signatureapi-integrate v2: Intake Gate + Product Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `signatureapi-integrate` skill stop and ask before building a new signing flow or "a platform like X", and give it a reference describing the three common product shapes with the REST sequence the app calls and the MCP tools the agent uses to prove it.

**Architecture:** Pure documentation change in the public `signatureapi/skills` repo plus one structural test. A new `## Intake` section in `SKILL.md` (placed before `## Orient` and `## Build`) classifies the request and carries the one-message question set, a worked example and a red-flag table. A new `references/product-shapes.md` describes the three shapes. The frontmatter description gains the "platform like X" trigger, which forces `npm run manifests`. The v2 MCP tool names that do not exist yet are marked "available from MCP tool surface v2 (SIG-1252)" and allowlisted in `test/spec-drift.allowlist.json` with a per-tool reason.

**Tech Stack:** Markdown skills, Node 22 `node --test`, `generate-manifests.mjs`, `update-filemap.mjs`.

**Spec:** `/root/orca/workspaces/app/SIG-1252-mcp-tools-v2/docs/superpowers/specs/2026-09-04-mcp-tools-v2-design.md`, section 6 "Skill changes" (requirement) and sections 1–3 (tool names and semantics). Read-only.

## Global Constraints

- Work only in `/root/orca/workspaces/app/skills-SIG-1253` (branch `feat/SIG-1253-intake-gate`). Never touch the submodule checkout.
- Never merge, never push to `main`, never deploy the website, never install the plugin into a real agent config.
- Commit per task as `type(scope): summary (SIG-1253)` with trailers `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_018AjnAZH3HRSJRiF7Yzqzf8`.
- Keep the existing SKILL.md voice: terse, imperative, concept-and-gotcha only, "the spec wins". No vendor names as recommendations (naming DocuSign as the thing a user asks for is already the house pattern).
- Do NOT remove today's REST fallbacks or the "Known gaps today" paragraph in SKILL.md; do NOT rewrite Build step 3 or the `watch-events.mjs` guidance. Those are the SIG-1252 follow-up and go in the PR body as a checklist.
- Every identifier backticked in skill markdown must exist in `https://spec.signatureapi.com/openapi.yaml` or be allowlisted with a reason. Verified against the live spec on 2026-09-04: events `envelope.completed`, `deliverable.generated`, `recipient.completed`; routes `POST /envelopes`, `POST /uploads`, `GET /envelopes/{envelopeId}/events`, `GET /envelopes/{envelopeId}/deliverables`, `GET /deliverables/{deliverableId}`, `POST /recipients/{recipientId}/ceremonies`, `POST /recipients/{recipientId}/replace`, `POST /senders`; identifiers `embeddable_in`, `redirect_url`, `redirect_delay`, `recipient_key`, `fixed_positions`, `place_key`, `email_link`, `email_code`, `identity_verification`, `delivery_type`, `envelope_id`, `recipient_id`. NOT in the public bundle (describe in prose only, never as a backticked route): `POST /recipients/{id}/resend` (`x-audience: internal`), `GET /uploads/{id}/structure` (`x-audience: sdk`). `ceremony_result` appears only in a description, never backtick it.
- Any byte change to `skills/*/SKILL.md` changes the sha256 digest in `agent-skills.json`; run `npm run manifests` and commit every regenerated file in the same commit.
- A new tracked file under `skills/` must be `git add`ed, then `npm run filemap` run, and `FILEMAP.md` committed alongside.
- `npm test` must end at 54 + the new tests, all passing, before the PR is opened.

---

### Task 0: Commit the plan

**Files:**
- Create: `docs/plans/2026-09-04-sig-1253-intake-gate.md` (this file)

- [ ] **Step 1: Commit**

```bash
cd /root/orca/workspaces/app/skills-SIG-1253
git add docs/plans/2026-09-04-sig-1253-intake-gate.md
git commit -q -F - <<'EOF'
docs(plans): implementation plan for the intake gate and product-shape reference (SIG-1253)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AjnAZH3HRSJRiF7Yzqzf8
EOF
```

---

### Task 1: Structural test (fails first)

**Files:**
- Create: `test/skill-structure.test.mjs`

**Interfaces:**
- Produces: three `node:test` cases that Tasks 2 and 3 turn green. They read `skills/signatureapi-integrate/SKILL.md` and `skills/signatureapi-integrate/references/*.md` from disk; no exports.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

// The intake gate is the difference between "build me a DocuSign" producing a
// design conversation and producing three days of unasked-for code. It only
// works if the section exists, sits before Build (an agent reads top-down and
// starts building the moment Build tells it to), and points at the reference
// that carries the three product shapes. This test pins those three facts;
// spec-drift.test.mjs covers the identifiers inside them.
const SKILL = new URL("../skills/signatureapi-integrate/SKILL.md", import.meta.url);
const REFERENCES = new URL("../skills/signatureapi-integrate/references/", import.meta.url);

test("SKILL.md has an Intake section, and it comes before Orient and Build", async () => {
  const text = await readFile(SKILL, "utf8");
  const intake = text.search(/^## Intake/m);
  const orient = text.search(/^## Orient/m);
  const build = text.search(/^## Build/m);
  assert.ok(intake >= 0, "no `## Intake` heading");
  assert.ok(orient >= 0 && build >= 0, "Orient and Build headings must still exist");
  assert.ok(intake < orient && intake < build, "Intake must precede Orient and Build");
});

test("references/product-shapes.md exists and is linked from SKILL.md's References list", async () => {
  const files = await readdir(REFERENCES);
  assert.ok(files.includes("product-shapes.md"), "references/product-shapes.md is missing");
  const text = await readFile(SKILL, "utf8");
  const referencesSection = text.slice(text.search(/^## References/m));
  assert.match(referencesSection, /^- `references\/product-shapes\.md` — /m);
});

test("every file under references/ is listed in SKILL.md's References list", async () => {
  const text = await readFile(SKILL, "utf8");
  const referencesSection = text.slice(text.search(/^## References/m));
  const missing = (await readdir(REFERENCES))
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !referencesSection.includes(`\`references/${f}\``));
  assert.deepEqual(missing, [], `add these to the References list in SKILL.md: ${missing.join(", ")}`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /root/orca/workspaces/app/skills-SIG-1253 && node --test test/skill-structure.test.mjs`
Expected: 2 failing (`no \`## Intake\` heading`, `product-shapes.md is missing`), 1 passing (every existing reference is already listed).

- [ ] **Step 3: Commit**

```bash
git add test/skill-structure.test.mjs
git commit -q -F - <<'EOF'
test(integrate): pin the Intake section position and the product-shapes reference link (SIG-1253)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AjnAZH3HRSJRiF7Yzqzf8
EOF
```

---

### Task 2: Intake section, frontmatter trigger, regenerated manifests

**Files:**
- Modify: `skills/signatureapi-integrate/SKILL.md` (frontmatter `description`; new `## Intake` section inserted between `## Facts come from the spec, not from this file` and `## Orient in this codebase first`)
- Regenerate: every manifest `npm run manifests` writes (`.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `.agents/plugins/`, `.grok-plugin/`, `gemini-extension.json`, `plugin.json`, `mcp.json`, `.mcp.json`, `agent-skills.json`)

**Interfaces:**
- Produces: the heading `## Intake — classify before you build` (matched by `/^## Intake/m` in Task 1) and a link to `references/product-shapes.md` inside the section body. Task 3 creates that file.

- [ ] **Step 1: Replace the frontmatter description (one line; the generator's regex is single-line)**

Old:

```
description: "SignatureAPI integration reference. Use when adding electronic signatures to an application, sending a document for signature, building or changing a signing flow, or wiring up SignatureAPI webhooks. The deliverable is application code calling the REST API; MCP and the bundled scripts are the agent's own tools for proving the flow. Covers even a seemingly simple task like creating a single envelope, since test-versus-live mode and place positioning carry gotchas. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
```

New:

```
description: "SignatureAPI integration reference. Use when adding electronic signatures to an application, sending a document for signature, building or changing a signing flow, wiring up SignatureAPI webhooks, or building a signing product or platform ('a platform like DocuSign', a self-serve signing tool) — the Intake section makes you ask and get a design approved before writing that code. The deliverable is application code calling the REST API; MCP and the bundled scripts are the agent's own tools for proving the flow. Covers even a seemingly simple task like creating a single envelope, since test-versus-live mode and place positioning carry gotchas. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
```

- [ ] **Step 2: Insert the Intake section**

Insert immediately before the line `## Orient in this codebase first`:

````markdown
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
````

- [ ] **Step 3: Regenerate the manifests**

Run: `cd /root/orca/workspaces/app/skills-SIG-1253 && npm run manifests && git status --short`
Expected: `agent-skills.json` changed (new digest and description); every per-ecosystem manifest that embeds the description changed. Do not hand-edit any of them.

- [ ] **Step 4: Run the structure test and manifests test**

Run: `node --test test/skill-structure.test.mjs test/generate-manifests.test.mjs`
Expected: Intake-position test passes; product-shapes test still fails (Task 3); all manifest tests pass.

- [ ] **Step 5: Commit**

```bash
git add skills/signatureapi-integrate/SKILL.md agent-skills.json plugin.json mcp.json .mcp.json gemini-extension.json .claude-plugin .cursor-plugin .codex-plugin .agents .grok-plugin
git commit -q -F - <<'EOF'
feat(integrate): intake gate before building a new signing flow or platform (SIG-1253)

Classify the request first. A narrow change proceeds; a new signing flow,
a new product surface or "a platform like X" stops, asks the seven
design questions in one message, presents a short design and waits for
a yes. The frontmatter description now triggers on platform-shaped
prompts, so every manifest that embeds it is regenerated here.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AjnAZH3HRSJRiF7Yzqzf8
EOF
```

---

### Task 3: `references/product-shapes.md`, References link, allowlist, FILEMAP

**Files:**
- Create: `skills/signatureapi-integrate/references/product-shapes.md`
- Modify: `skills/signatureapi-integrate/SKILL.md` (References list gains one line)
- Modify: `test/spec-drift.allowlist.json` (new groups for v2 tool names and the existing webhook tool names, each with a reason)
- Regenerate: `FILEMAP.md` (`npm run filemap`), manifests (`npm run manifests`, because SKILL.md bytes change)

**Interfaces:**
- Consumes: the v2 tool names and semantics from spec sections 3.1–3.9: `whoami`, `get_test_api_key`, `list_events` (`wait_seconds`), `get_deliverables`, `resend_request`, `replace_recipient`, `create_ceremony`, `inspect_upload`, `update_webhook`.

- [ ] **Step 1: Write the reference**

````markdown
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
   `GET /envelopes/{envelopeId}/deliverables` and `GET
   /deliverables/{deliverableId}` to fetch the signed PDF and audit log,
   and store them where the app keeps documents.
5. For "the signer lost the email": the resend operation on the recipient
   (public REST from SIG-1252; internal before that — until then the
   dashboard resends). For "wrong person": `POST
   /recipients/{recipientId}/replace`.

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
- `create_ceremony` *(v2)* to exercise re-issuing a link (fallback: `POST
  /recipients/{recipientId}/ceremonies` from a script or the hurl-style
  request of your choice).
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
   placeholders found (public REST from SIG-1252; `x-audience: sdk` before
   that) — so the field-placement UI can render pages at the right aspect
   ratio and convert screen coordinates to PDF points, origin top-left.
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
   5), `POST /recipients/{recipientId}/replace`, and `POST
   /envelopes/{envelopeId}/cancel`.

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
````

- [ ] **Step 2: Link it from SKILL.md's References list**

Add after the `references/brownfield-placement.md` line:

```
- `references/product-shapes.md` — the three common product shapes: what the app calls, what you prove it with
```

- [ ] **Step 3: Extend the spec-drift allowlist**

Replace `test/spec-drift.allowlist.json` with:

```json
{
  "$comment": "Backticked snake_case identifiers that skill markdown may mention even though they do not exist in the published OpenAPI spec. Every entry needs a reason. Anything not listed here and not found in the spec fails test/spec-drift.test.mjs — add an entry only when the identifier genuinely lives outside the spec (an MCP tool, an MCP-only field, a key prefix), never to paper over a spec mismatch.",
  "mcp_tools": [
    "create_envelope",
    "get_envelope",
    "list_envelopes",
    "cancel_envelope",
    "delete_envelope",
    "mint_upload_url",
    "list_emails",
    "get_email",
    "search_documentation"
  ],
  "$comment_mcp_tools_webhooks": "Webhook tools on the hosted MCP server (SIG-1225); referenced by references/product-shapes.md as available when the client lists them.",
  "mcp_tools_webhooks": [
    "list_webhooks",
    "create_webhook",
    "get_webhook_secret",
    "test_webhook",
    "list_webhook_attempts"
  ],
  "$comment_mcp_tools_v2": "MCP tool surface v2 (SIG-1252). Not in the OpenAPI spec because they are MCP tools, and not on every server yet; product-shapes.md marks each as (v2) with a REST fallback. Reasons per name:",
  "$reasons_mcp_tools_v2": {
    "whoami": "session identity and mode — no REST counterpart an app would call",
    "get_test_api_key": "credential handoff into the project env file — MCP-only by design",
    "list_events": "one tool over the three REST event listings plus wait_seconds polling",
    "get_deliverables": "merges the deliverable list and per-deliverable GET so URLs are fresh",
    "resend_request": "mirrors the recipient resend operation, internal in today's public spec",
    "replace_recipient": "mirrors POST /recipients/{id}/replace",
    "create_ceremony": "mirrors POST /recipients/{id}/ceremonies",
    "inspect_upload": "mirrors the upload structure endpoint, x-audience sdk in today's public spec",
    "update_webhook": "MCP webhooks PATCH — webhooks have no public REST surface"
  },
  "mcp_tools_v2": [
    "whoami",
    "get_test_api_key",
    "list_events",
    "get_deliverables",
    "resend_request",
    "replace_recipient",
    "create_ceremony",
    "inspect_upload",
    "update_webhook"
  ],
  "$comment_mcp_tool_inputs": "wait_seconds is a list_events (v2) input, not a REST field.",
  "mcp_tool_inputs": ["wait_seconds"],
  "mcp_only_fields": ["ceremony_url"],
  "key_prefixes": ["key_test_"]
}
```

`x_audience` is never backticked as one token (`x-audience` uses a hyphen, which the identifier regex does not match).

- [ ] **Step 4: Track the file, regenerate FILEMAP and manifests**

Run:

```bash
cd /root/orca/workspaces/app/skills-SIG-1253
git add skills/signatureapi-integrate/references/product-shapes.md
npm run filemap && npm run manifests && git status --short
```

Expected: `FILEMAP.md` gains `- \`skills/signatureapi-integrate/references/product-shapes.md\` — Product shapes`; `agent-skills.json` digest changes again.

- [ ] **Step 5: Run the whole suite**

Run: `npm test 2>&1 | tail -12`
Expected: `tests 57`, `pass 57`, `fail 0`. If spec-drift lists an identifier, either fix the markdown to the spec's name (preferred) or, only for a genuinely non-spec name, add it to the allowlist with a reason. If the stale-allowlist test lists an entry, remove that entry — never keep an unused name.

- [ ] **Step 6: Commit**

```bash
git add skills/signatureapi-integrate/SKILL.md skills/signatureapi-integrate/references/product-shapes.md test/spec-drift.allowlist.json FILEMAP.md agent-skills.json plugin.json mcp.json .mcp.json gemini-extension.json .claude-plugin .cursor-plugin .codex-plugin .agents .grok-plugin
git commit -q -F - <<'EOF'
docs(integrate): product-shapes reference for the three common integration shapes (SIG-1253)

Send-for-signature feature, embedded signing step, self-serve platform:
for each, the REST sequence the application calls, the MCP tools the
agent proves it with, the decisions Intake must settle and the two
likeliest mistakes. Tools from MCP tool surface v2 (SIG-1252) are marked
(v2) with today's REST fallback beside them and allowlisted for the
spec-drift check with a reason each.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AjnAZH3HRSJRiF7Yzqzf8
EOF
```

---

### Task 4: Verify, push, open the PR

**Files:** none new.

- [ ] **Step 1: Full verification from a clean state**

```bash
cd /root/orca/workspaces/app/skills-SIG-1253
git status --short            # expected: empty
npm test 2>&1 | tail -8       # expected: tests 57, pass 57
grep -c "known gaps\|Known gaps" skills/signatureapi-integrate/SKILL.md   # expected: 1 — the paragraph is untouched
git diff origin/main --stat
```

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/SIG-1253-intake-gate
```

- [ ] **Step 3: Open the PR against `main`**

```bash
gh pr create -R signatureapi/skills --base main --head feat/SIG-1253-intake-gate \
  --title "feat(integrate): intake gate before building + product-shape reference (SIG-1253)" \
  --body-file - <<'EOF'
## What

- **Intake gate** in `signatureapi-integrate/SKILL.md`, before Orient and Build: classify the request; a narrow change proceeds, a new signing flow / new product surface / "a platform like X" stops, asks the seven design questions in one message, presents a short design and waits for an explicit yes. Worked example of the message and a red-flag table included. The frontmatter description now triggers on platform-shaped prompts; every manifest that embeds it is regenerated.
- **`references/product-shapes.md`**: send-for-signature feature, embedded signing step, self-serve platform — for each, the REST sequence the app calls, the MCP tools the agent proves it with, the decisions Intake must settle, and the two likeliest mistakes. Tools from MCP tool surface v2 (SIG-1252) are marked *(v2)* with today's REST fallback beside them; the spec-drift allowlist gains those names with a reason each.
- **Test** `test/skill-structure.test.mjs`: Intake heading exists and precedes Orient/Build; product-shapes.md exists and is linked; every reference file is listed.
- `signatureapi-diagnose` unchanged: its "Building a new signing flow belongs to signatureapi-integrate" pointer already routes intake cases.

Not changed on purpose: today's REST fallbacks, the "Known gaps today" paragraph, Build step 3 and the `watch-events.mjs` guidance. Those depend on SIG-1252 being deployed.

## Follow-up when SIG-1252 ships

- [ ] Delete the "Known gaps today" sentence in the Two-surfaces section; list the 24 tools.
- [ ] Build step 3: replace "registered in the dashboard" with `create_webhook` + `get_webhook_secret`; point `references/webhooks.md` "Registering an endpoint" at the tools and `list_webhook_attempts`.
- [ ] Replace `watch-events.mjs` polling guidance with `list_events` + `wait_seconds` (keep the script for REST-only environments).
- [ ] Add `inspect_upload` to `references/places.md` under `fixed_positions`.
- [ ] Add `get_test_api_key` to setup, ahead of `check-setup.mjs`.
- [ ] Drop the *(v2)* markers and REST fallbacks in `references/product-shapes.md`; backtick the resend and upload-structure routes once the public bundle carries them.
- [ ] `signatureapi-diagnose`: use `list_events`, `list_webhook_attempts`, `get_deliverables`, `resend_request`; remove the "no webhook-delivery log" limitation.
- [ ] Clean-room dogfood: the "build me a DocuSign" prompt must produce the Intake message, not code.

## Verification

`npm test`: 57 passing (54 before). Spec-drift ran against the live spec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018AjnAZH3HRSJRiF7Yzqzf8
EOF
```

---

## Deviations recorded during execution

- **Task 2 also regenerates `FILEMAP.md`.** `update-filemap.mjs` embeds each SKILL.md's frontmatter description, so the description change stales FILEMAP as well as `agent-skills.json`. Rule: any SKILL.md frontmatter edit runs both `npm run manifests` and `npm run filemap`.
- **`whoami` is not in the `mcp_tools_v2` allowlist array.** The spec-drift identifier regex only matches snake_case names containing an underscore, so `whoami` is never checked, and the stale-allowlist test rejects an entry nothing checks. Its reason stays in the `$reasons_mcp_tools_v2` map (skipped by the loader) with a note saying why.
- Only `agent-skills.json` changed under `npm run manifests`: the per-ecosystem manifests embed a shared plugin `DESCRIPTION` constant, not the skill descriptions.

## Self-review

- **Spec coverage** (section 6, SIG-1253 items in scope for this PR): Intake section with classification, one-message questions, design-then-yes — Task 2. `references/product-shapes.md` with the three shapes and the tool/endpoint sequences — Task 3. Items deferred by the task brief (delete known-gaps, replace step 3, `watch-events` → `list_events`, `inspect_upload` in places, `get_test_api_key` in setup, diagnose updates) — listed as the PR-body checklist in Task 4, as instructed.
- **Placeholder scan**: none; every step carries its full content.
- **Consistency**: the heading `## Intake — classify before you build` matches the test's `/^## Intake/m`; the References line matches `/^- \`references\/product-shapes\.md\` — /m`; the allowlist group names are only read via `Object.entries(...).flatMap`, so the `$`-prefixed reason keys are skipped exactly as `$comment` is today.
