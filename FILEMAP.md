# FILEMAP

Every file in this repo and what it is for.

- `skills/signatureapi-diagnose/package-lock.json` — npm lockfile pinning this skill's dependencies for reproducible installs
- `skills/signatureapi-diagnose/package.json` — npm manifest for @signatureapi/signatureapi-diagnose (dependencies: yaml)
- `skills/signatureapi-diagnose/references/errors.md` — HTTP errors
- `skills/signatureapi-diagnose/scripts/diagnose-envelope.mjs` — Diagnoses why an envelope is stuck or missing a deliverable
- `skills/signatureapi-diagnose/scripts/lib/output.mjs` — Shared ok/fail/gap JSON output helpers for every script
- `skills/signatureapi-diagnose/SKILL.md` — SignatureAPI failure runbook. Use when an envelope is stuck in processing, a signature webhook never arrived, a recipient never got the signing email, a deliverable is missing after completion, or the API returns 422 on envelope creation.
- `skills/signatureapi-integrate/package-lock.json` — npm lockfile pinning this skill's dependencies for reproducible installs
- `skills/signatureapi-integrate/package.json` — npm manifest for @signatureapi/signatureapi-integrate (dependencies: yaml)
- `skills/signatureapi-integrate/references/brownfield-placement.md` — Placing signing in an existing codebase
- `skills/signatureapi-integrate/references/places.md` — Places
- `skills/signatureapi-integrate/references/verification-loop.md` — Verifying a ceremony actually happened
- `skills/signatureapi-integrate/references/webhooks.md` — Webhooks
- `skills/signatureapi-integrate/scripts/check-setup.mjs` — Checks credentials, mode, and API reachability
- `skills/signatureapi-integrate/scripts/complete-ceremony.mjs` — Branch B: drives a real browser through a ceremony (consent-gated)
- `skills/signatureapi-integrate/scripts/create-test-envelope.mjs` — Prints or creates a minimum viable test envelope
- `skills/signatureapi-integrate/scripts/lib/output.mjs` — Shared ok/fail/gap JSON output helpers for every script
- `skills/signatureapi-integrate/scripts/make-test-document.mjs` — Builds and uploads a throwaway test PDF
- `skills/signatureapi-integrate/scripts/openapi-explore.mjs` — Queries the bundled OpenAPI spec: paths, path detail, schema
- `skills/signatureapi-integrate/scripts/watch-events.mjs` — Polls envelope events until a terminal status
- `skills/signatureapi-integrate/scripts/webhook-receiver.mjs` — Local HTTP receiver that prints arriving webhook events
- `skills/signatureapi-integrate/SKILL.md` — SignatureAPI integration reference. Use when adding electronic signatures to an application, sending a document for signature, building or changing a signing flow, or wiring up SignatureAPI webhooks.
