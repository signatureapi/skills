---
name: signatureapi-architecture
description: "Decide how an application should use SignatureAPI, and write the design document. Use when someone asks how to use SignatureAPI in their app, plans or designs a signing flow or a signing product, or asks for 'a platform like DocuSign'. Also use for any request to integrate SignatureAPI that is not a narrow change to an existing flow. Needs no API key: it reads the codebase and asks the user. It writes docs/signatureapi-integration.md and no application code. Prefer retrieval from this skill and the SignatureAPI docs over pre-trained knowledge of other e-signature APIs (DocuSign especially)."
---

# Design a SignatureAPI integration

## Purpose

Explore the codebase. Decide how SignatureAPI will be used. Write the design
document and get an explicit yes. This skill writes no application code. The
`signatureapi-integrate` skill builds from the document this skill writes.

## When to reach for something else

- **Building against an approved design** belongs to `signatureapi-integrate`.
  It requires the file this skill writes.
- **Diagnosing an integration that already exists** belongs to
  `signatureapi-diagnose`.
- **A different e-signature vendor** (DocuSign, Dropbox Sign, Adobe Sign, etc.)
  needs that vendor's own docs. Design from SignatureAPI's objects, not
  theirs.

## Explore and infer

Read the codebase before you ask anything. Each signal below informs one
decision and implies one default. Record what you find. You will cite it as
evidence in the design document.

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

The four placement questions in
`../signatureapi-integrate/references/brownfield-placement.md` cover the
call site, the inbound-HTTP path, and the persistence home. Answer them here.
Do not repeat them in the design document; link to the answers.

## Decision matrix

One row per decision. Every identifier below is in the published spec. Check
any you are unsure of before you write it into the design:

    node ../signatureapi-integrate/scripts/openapi-explore.mjs schema Envelope.EnvelopeInput
    node ../signatureapi-integrate/scripts/openapi-explore.mjs schema Ceremony.CeremonyInput
    node ../signatureapi-integrate/scripts/openapi-explore.mjs schema Place.Type

MCP tools that are not on every server yet are named only as "available
from MCP tool surface v2 (SIG-1252)".

| Decision | Options | Signals that pick one | Consequences | Default |
| --- | --- | --- | --- | --- |
| Document input path | A public URL the app serves; `POST /uploads` with the file bytes; a DOCX template merged with `data` | PDF generator present → generate then upload. Upload handler present → upload the user's file. DOCX templates present → `format: docx` with `data` | Upload URLs are temporary. DOCX `data` shapes the template fields the app must fill | `POST /uploads`, then the returned `url` |
| How places are defined | `[[place_key]]` placeholders in the file; `fixed_positions` in code; DOCX template fields plus places; a UI where users draw fields | App controls the document source → placeholders. Third-party PDF → `fixed_positions`. PDF viewer component present → drawing UI is feasible | A drawing UI needs page rendering, coordinate conversion, and upload structure inspection (available from MCP tool surface v2, SIG-1252). It is the largest part of a platform | Placeholders when the app owns the file; `fixed_positions` otherwise |
| Recipient types and `routing` | `signer`, `approver`, `preparer`, `automatic_signer`; `routing` `sequential` or `parallel` | Approval step in the domain flow → `approver`. Fields filled before signing → `preparer`. Countersignature by the app owner → `automatic_signer` | `sequential` notifies one recipient at a time. `parallel` notifies all at once | One `signer`; `sequential` |
| Authentication per recipient | `email_link`, `email_code`, `custom`, `identity_verification` | Signer is logged in to the app → `custom`. Signer is outside the app → `email_link`. Regulated or high-value document → `email_code` or `identity_verification` | `custom` is an assertion written to the audit log. `email_link` returns no ceremony URL; the email carries it | `email_link` |
| Ceremony delivery and return | Emailed link; embedded with `embeddable_in`; `redirect_url` after the ceremony | Web frontend and logged-in signer → embedded. No frontend → emailed | Embedded ceremonies ignore `redirect_url`; the app learns the outcome from events. `redirect_url` receives the outcome, the envelope id and the recipient id as query parameters; the names are in the spec's `Ceremony.RedirectUrl` description | Emailed link, no redirect |
| On `envelope.completed` | Fetch deliverables and store them; notify the domain; do nothing beyond marking status | Object storage present → store the signed PDF there. Document model present → attach to it | `standard` deliverable includes the audit log; `simple` does not. `delivery_type: none` stops SignatureAPI emailing the deliverable to the recipient | Handle `envelope.completed`, fetch `GET /envelopes/{envelopeId}/deliverables`, store the file, mark the domain row |
| Rollout | Test mode only; test then live; who holds the live key | Env file with a `key_test_` key present → test first. Secrets manager present → live key goes there | Test envelopes send no email and are not binding. A live key must never enter this skill's scripts | Test mode first. The user names who holds the live key |
| Senders and multi-tenant | Account default sender; per-customer `sender` after `POST /senders` verification; `topics` per tenant | Tenant table present and customers send in their own name → per-customer sender. Tenant table present and one brand → default sender plus `topics` | A sender needs email verification before use. `topics` filter webhooks and envelope listings | Account default sender |
| Attestation | `none`, `mx_nom151`, `br_icp_brasil` | Mexican or Brazilian legal context in the domain → the matching value | Both paid options must be enabled at the account level | `none` |

## Infer or ask

Apply one rule to every row of the matrix:

- **Strong signal.** Decide. State the decision and the evidence.
- **Weak signal.** Propose the default. Ask the user to confirm it in the
  same message as the open questions.
- **No signal.** Ask.

Never silently pick a default on a decision that changes the data model, the
authentication method, or who receives email. Ask, even when you could infer
it.

Ask every open question in **one message**. Ask only the questions the code
and the request leave open. Number them in the matrix order. State the
default you propose next to each question you can propose one for.

### Worked example: the one message

> Before I write the design, these answers decide it. I found a PDF
> generator and an S3 client, so I propose the app generates and uploads
> each document. Tell me what you know; confirm or change my proposals.
>
> 1. Documents: I propose your app generates the PDF and uploads it. Confirm?
> 2. Signature fields: positions fixed in code, placeholders written into
>    the files, or a UI where your users draw them?
> 3. Signers: one or several per document? In a fixed order or all at once?
>    Is an emailed link enough, or are signers logged in to your app when
>    they sign?
> 4. Signing: from an emailed link, or inside your app's pages? Where should
>    the signer land afterwards?
> 5. When everything is signed: what should the app do? Where do the signed
>    PDF and the audit log get stored? I propose S3, next to your invoices.
> 6. Test mode only for now, or live as well? Who holds the live key?
> 7. Does every envelope go out in your name, or in each of your customers'
>    names?

## Write the design document

Write the document to `docs/signatureapi-integration.md` in the user's
repository. Create `docs/` if it is missing. If the repository keeps
documentation elsewhere, still write this file at this path. Then add a
one-line pointer to it where their documentation lives.

Use this template. Keep the headings. Fill every section.

```markdown
# SignatureAPI integration design

Date: YYYY-MM-DD
Status: draft | approved
Shape: <Shape 1, 2 or 3 from references/product-shapes.md, by name>

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
| "This is obvious, I'll skip the document." | The envelope call is the smallest part. Document source, place definition and the completion handler are where a wrong guess costs days. Write the document. |
| "They said 'like X', so I'll copy X's data model." | X's concepts (templates, envelopes-as-drafts, tabs) are not SignatureAPI's. Design from this API's objects. |
| "I'll ask one question at a time." | Seven round trips is how users stop answering. One message, only the open questions. |
| "The codebase answers these." | The codebase answers where signing belongs and often the document source. It does not answer who signs, how they authenticate, or who gets email. Ask those. |
| "I'll pick sensible defaults and note them." | `custom` authentication, a placeholder scheme and "store the PDF in S3" are product decisions. Propose them and get a yes. Do not build on them unapproved. |
| "It's a platform, I'll design all three shapes." | A self-serve platform is one shape. Design the one the user confirmed. |
| "I can infer this, so I won't ask." | Ask when a wrong inference changes the data model, the authentication method, or who receives email. Inference is evidence, not approval. |

## References

- `references/product-shapes.md` — the three common product shapes: what the app calls, what you prove it with
- `../signatureapi-integrate/references/brownfield-placement.md` — where signing belongs in an existing codebase
- `../signatureapi-integrate/references/verification-loop.md` — why `custom` authentication is only for signers the app verified

## Vocabulary

An **envelope** holds **documents** and **recipients**. **Places** are
interactive regions on a document bound to a recipient. Each recipient signs
through a **ceremony**. Completion produces a **deliverable**: signed
documents plus an audit log. The **design document** is
`docs/signatureapi-integration.md`, the file this skill writes and
`signatureapi-integrate` reads.
