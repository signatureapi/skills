---
name: signatureapi-architecture
description: "Decide how an application should use SignatureAPI, and write the design document. Use when someone asks how to use SignatureAPI in their app, plans or designs a signing flow or a signing product, or asks for 'a platform like DocuSign'. Also use for any request to integrate SignatureAPI that is not a narrow change to an existing flow. Needs no API key: it asks the user what they want, reads the codebase, and settles the decisions together. It writes docs/signatureapi-integration.md and no application code. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
---

# Design a SignatureAPI integration

## Purpose

Understand what the user wants their people to experience. Then decide how
SignatureAPI delivers it. Write the design document and get an explicit yes.
This skill writes no application code. The `signatureapi-integrate` skill
builds from the document this skill writes.

## When to reach for something else

- **Building against an approved design** belongs to `signatureapi-integrate`.
  It requires the file this skill writes.
- **Diagnosing an integration that already exists** belongs to
  `signatureapi-diagnose`.
- **A different e-signature vendor** (DocuSign, Dropbox Sign, Adobe Sign, etc.)
  needs that vendor's own docs. Map the user's needs onto SignatureAPI's
  objects, not onto that vendor's.

## Keep the user's vocabulary

Preserve the user's product, domain and UI vocabulary. A "contract", an
"offer letter", a "client", a "tenant", an "onboarding step": keep those
names. Use SignatureAPI terms (envelope, recipient, place, ceremony,
deliverable) only when discussing the API boundary. Document the mapping
between the two in the design document instead of renaming the user's
concepts. Do the same with the user's own code: their models keep their
names.

## Understand the experience first

Before reading code and before naming any API object, establish four things
with the user:

- **The journey.** Who starts it, what they see, what the signer sees, and
  what happens after everyone has signed. Ask for the story in their words.
- **The actors.** Who sends, who signs, who approves, who only watches. Which
  of them are the app's own users and which are outsiders.
- **The success condition.** What must be true for the user to call this
  done. A signed PDF in a folder, a status on a record, an email, a
  dashboard entry.
- **The constraints.** Deadline, legal context, existing vendor, volume,
  budget, must-not-change parts of the app.

When the request already says most of this, restate it in one short
paragraph and ask only for what is missing. Ask in the user's words. Do not
ask about authentication methods, place types or routing yet.

Then ask one more question: **quick or thorough?** Offer the choice in one
line. "I can propose one recommended design and you confirm or correct it.
Or we explore alternatives together first." The answer sets the pace of the
rest of the conversation. Quick means: one recommended design, decisions
stated with their evidence, a short confirmation round. Thorough means:
present the alternatives, resolve the decisions in a few grouped rounds.

## Explore the codebase

Now read the code. Each signal below informs one decision and implies one
default. Record what you find; you will cite it as evidence.

- **Document origin.** Grep for PDF generation libraries, upload handlers,
  object storage clients, DOCX or templating code. Informs the document input
  path. Default: the app already has the file, so pass its URL or use
  `POST /uploads`.
- **User authentication and a web frontend.** Grep for session or login
  code, and for a browser UI. Informs recipient authentication and whether
  the ceremony is emailed or embedded. Default: emailed link (`email_link`)
  for people outside the app. Embedded (`custom` plus `embeddable_in`) only
  for signers who are logged in to the app.
- **Tenancy.** Grep for organization, account, or tenant tables. Informs
  `sender` and `topics`. Default: one sender (the account's default) and no
  topics.
- **Webhook routes, queues, domain events.** Grep for existing inbound
  webhook handlers, job queues, event dispatch. Informs how events are
  handled and where envelope creation runs. Default: reuse the existing
  webhook route pattern and the existing background-job path.
- **Where third-party ids are persisted.** Grep for columns or tables that
  hold Stripe, Twilio, or similar ids. Informs where the envelope id goes.
  Default: a column on the domain row that motivated the signature.
- **PDF viewer or canvas components.** Grep for PDF rendering in the
  frontend. Informs whether a place-drawing UI is feasible. Default: no
  drawing UI. Use placeholders or `fixed_positions` set in code.
- **Design records.** Look for an ADR directory (`docs/adr`, `adr/`), a
  design-docs folder, or a decisions log. When one exists, the design
  document goes there, in that convention, with a pointer at the default
  path. An ADR directory counts even though this document is longer than
  one ADR.

The four placement questions in
`../signatureapi-integrate/references/brownfield-placement.md` cover the
call site, the inbound-HTTP path, and the persistence home. Answer them here.
Do not repeat them in the design document; link to the answers.

## Present the possibilities

Match the journey to the closest starting points in
`references/product-shapes.md`. Three common shapes are described there:
send-for-signature inside an existing app, an embedded signing step, and a
self-serve platform. They are starting points, not a menu. Many products
combine two, or fit none. Say which shape is closest, what differs, and
what that difference costs. In thorough mode, present two or three
alternatives with their trade-offs. In quick mode, present one and say why.

## Decide progressively

Apply one rule to every decision:

- **Strong signal.** Decide. State the decision and the evidence.
- **Weak signal.** Propose the default. Ask the user to confirm it.
- **No signal.** Ask.

Never silently pick a default on a decision that changes the data model, the
authentication method, or who receives email. Ask, even when you could infer
it.

Ask in rounds, not in one questionnaire. Group the questions that depend on
each other: the document and its fields; the signers and how they
authenticate; what happens on completion; tenancy and rollout. At most four
questions per message. One decision per question. Put the proposed answer
next to each question you can propose one for. Resolve one group, then move
to the next. Stop asking when the direction is clear and the remaining
decisions have a strong signal or a confirmed default.

### Worked example: the first round

> You described this: a customer accepts a quote in your app, then your
> account manager and the customer both sign the order form, and the signed
> PDF goes onto the order. I found a PDF generator and an S3 client, so I
> propose your app generates the order form and uploads it. Two questions
> on the document before we get to the signers:
>
> 1. Does your app generate the order form, or do account managers upload
>    their own files? I propose generated.
> 2. Where do the signature fields go: markers written into the generated
>    PDF (my proposal), or positions set in code?

## Decision matrix

The API-facing decisions, one row each. Every identifier below is in the
published spec. Check any you are unsure of before you write it into the
design:

    node ../signatureapi-integrate/scripts/openapi-explore.mjs schema Envelope.EnvelopeInput
    node ../signatureapi-integrate/scripts/openapi-explore.mjs schema Ceremony.CeremonyInput
    node ../signatureapi-integrate/scripts/openapi-explore.mjs schema Place.Type

| Decision | Options | Signals that pick one | Consequences | Default |
| --- | --- | --- | --- | --- |
| Document input path | A public URL the app serves; `POST /uploads` with the file bytes; a DOCX template merged with `data` | PDF generator present → generate then upload. Upload handler present → upload the user's file. DOCX templates present → `format: docx` with `data` | Upload URLs are temporary. DOCX `data` shapes the template fields the app must fill | `POST /uploads`, then the returned `url` |
| How places are defined | `[[place_key]]` placeholders in the file; `fixed_positions` in code; DOCX template fields plus places; a UI where users draw fields | App controls the document source → placeholders. Third-party PDF → `fixed_positions`. PDF viewer component present → drawing UI is feasible | A drawing UI needs page rendering, coordinate conversion, and reading the upload's structure (`inspect_upload`). It is the largest part of a platform | Placeholders when the app owns the file; `fixed_positions` otherwise |
| Recipient types and `routing` | `signer`, `approver`, `preparer`, `automatic_signer`; `routing` `sequential` or `parallel` | Approval step in the domain flow → `approver`. Fields filled before signing → `preparer`. Countersignature by the app owner → `automatic_signer` | `sequential` notifies one recipient at a time. `parallel` notifies all at once | One `signer`; `sequential` |
| Authentication per recipient | `email_link`, `email_code`, `custom`, `identity_verification` | Signer is logged in to the app → `custom`. Signer is outside the app → `email_link`. Regulated or high-value document → `email_code` or `identity_verification` | `custom` is an assertion written to the audit log. `email_link` returns no ceremony URL; the email carries it | `email_link` |
| Ceremony delivery and return | Emailed link; embedded with `embeddable_in`; `redirect_url` after the ceremony | Web frontend and logged-in signer → embedded. No frontend → emailed | Embedded ceremonies ignore `redirect_url`; the app learns the outcome from events. `redirect_url` receives the outcome, the envelope id and the recipient id as query parameters; the names are in the spec's `Ceremony.RedirectUrl` description | Emailed link, no redirect |
| On `envelope.completed` | Fetch deliverables and store them; notify the domain; do nothing beyond marking status | Object storage present → store the signed PDF there. Document model present → attach to it | `standard` deliverable includes the audit log; `simple` does not. `delivery_type: none` stops SignatureAPI emailing the deliverable to the recipient | Handle `envelope.completed`, fetch `GET /envelopes/{envelopeId}/deliverables`, store the file, mark the domain row |
| Rollout | Test mode only; test then live; who holds the live key | Env file with a `key_test_` key present → test first. Secrets manager present → live key goes there | Test envelopes send no email and are not binding. A live key must never enter this skill's scripts | Test mode first. The user names who holds the live key |
| Senders and multi-tenant | Account default sender; per-customer `sender` after `POST /senders` verification; `topics` per tenant | Tenant table present and customers send in their own name → per-customer sender. Tenant table present and one brand → default sender plus `topics` | A sender needs email verification before use. `topics` filter webhooks and envelope listings | Account default sender |
| Attestation | `none`, `mx_nom151`, `br_icp_brasil` | Mexican or Brazilian legal context in the domain → the matching value | Both paid options must be enabled at the account level | `none` |

## Cover the whole product, not only the API

The matrix settles the API configuration. A product design has more in it.
`references/coverage-checklist.md` lists the other areas. Ownership and
permissions. The draft and template lifecycle. Tenant isolation. Sensitive
data and retention. Idempotency and repair paths. Volume and observability.
Accessibility and localization. Explicit non-goals. Walk the list once
before writing. Take from it what this product needs. It is a checklist for
you, not a questionnaire for the user. Most items resolve from the journey
and the code without a question.

## Write the design document

Write the document only once the direction is understood. That means the
journey is confirmed and the shape is chosen. Every decision that changes
the data model, the authentication or who receives email has a yes.

Location: the repository's established place for design records when it
has one (an ADR directory, a design-docs folder), in that convention. Then
put a one-line pointer at `docs/signatureapi-integration.md`, so
`signatureapi-integrate` finds it. Without an established place, write the
document itself at `docs/signatureapi-integration.md`. Create `docs/` if it
is missing.

Use this template. Keep the headings. Fill every section that applies; delete
a section only when you say why in Open items.

```markdown
# <the user's name for this feature> — SignatureAPI integration design

Date: YYYY-MM-DD
Status: draft | approved
Starting point: <closest shape from references/product-shapes.md, or "custom">
Departures from it: <one line each, or "none">

## The experience

- Journey:
- Actors:
- Success condition:
- Constraints:
- Non-goals:

## Vocabulary

| The user's term | Means, at the API boundary |
| --- | --- |
| <their term> | <envelope / recipient / place / ceremony / deliverable, and how> |

## Decisions

### Document input path
- Decision:
- Evidence or answer:
- Consequence:

### Places
- Decision:
- Evidence or answer:
- Consequence:

### Recipients and routing
- Decision:
- Evidence or answer:
- Consequence:

### Authentication per recipient
- Decision:
- Evidence or answer:
- Consequence:

### Ceremony delivery and return
- Decision:
- Evidence or answer:
- Consequence:

### On envelope.completed and deliverables
- Decision:
- Evidence or answer:
- Consequence:

### Rollout
- Decision:
- Evidence or answer:
- Consequence:

### Senders and multi-tenant
- Decision:
- Evidence or answer:
- Consequence:

### Attestation
- Decision:
- Evidence or answer:
- Consequence:

## Product coverage

<one short entry per applicable area from references/coverage-checklist.md:
ownership and permissions; drafts and templates; tenant isolation; sensitive
data and retention; idempotency, reconciliation and repair; volume and
observability; accessibility, mobile, localization, branding>

## Endpoint sequence the application calls

1. <method and path, and where in the codebase it is called from>

## Events the application handles

- <event type> — <what the handler does>

## What the application persists

- <field or table> — <what it holds>

## Open items

- <anything still unanswered>
```

Present the document to the user. Ask for an explicit yes. Set `Status:
approved` only after the user says yes. The file is the contract
`signatureapi-integrate` reads. Do not start building.

## Red flags

| Thought | Reality |
| --- | --- |
| "I'll read the code first, then ask." | The code says where signing fits. It does not say what the user wants their people to experience. Ask that first. |
| "This is obvious, I'll skip the document." | The envelope call is the smallest part. Document source, place definition and the completion handler are where a wrong guess costs days. Write the document. |
| "They said 'like X', so I'll copy X's data model." | X's concepts (templates, envelopes-as-drafts, tabs) are not SignatureAPI's. Map the user's needs onto this API's objects. |
| "I'll rename their 'contract' to 'envelope'." | Their word stays. The mapping goes in the Vocabulary table. |
| "I'll ask everything in one message to save round trips." | Twelve decisions in one message is a form, and forms go unanswered. Four questions, grouped, then the next group. |
| "I'll ask one question at a time." | Related questions go together. A signer question needs its authentication question next to it. |
| "It's one of the three shapes." | The shapes are starting points. Name the closest one and the departures. A hybrid or a custom flow is a valid answer. |
| "The codebase answers these." | The codebase answers where signing belongs and often the document source. It does not answer who signs, how they authenticate, or who gets email. Ask those. |
| "I'll pick sensible defaults and note them." | `custom` authentication, a placeholder scheme and "store the PDF in S3" are product decisions. Propose them and get a yes. Do not build on them unapproved. |
| "It's a platform, I'll design all three shapes." | Design the product the user confirmed, not every product SignatureAPI could support. |
| "I can infer this, so I won't ask." | Ask when a wrong inference changes the data model, the authentication method, or who receives email. Inference is evidence, not approval. |

## References

- `references/product-shapes.md` — three common starting points: what the app calls, what you prove it with
- `references/coverage-checklist.md` — the product-design areas beyond API configuration
- `../signatureapi-integrate/references/brownfield-placement.md` — where signing belongs in an existing codebase
- `../signatureapi-integrate/references/verification-loop.md` — why `custom` authentication is only for signers the app verified

## Vocabulary

An **envelope** holds **documents** and **recipients**. **Places** are
interactive regions on a document bound to a recipient. Each recipient signs
through a **ceremony**. Completion produces a **deliverable**: signed
documents plus an audit log. These words describe the API boundary. The
user's own words describe their product. The **design document** is
`docs/signatureapi-integration.md`, the file this skill writes and
`signatureapi-integrate` reads.
