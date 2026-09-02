# FILEMAP

Every file in this repo and what it is for.

- `skills/engineering/integrate-signatures/package-lock.json` — npm lockfile pinning this skill's dependencies for reproducible installs
- `skills/engineering/integrate-signatures/package.json` — npm manifest for @signatureapi/integrate-signatures (dependencies: yaml)
- `skills/engineering/integrate-signatures/references/brownfield-placement.md` — Placing signing in an existing codebase
- `skills/engineering/integrate-signatures/references/places.md` — Places
- `skills/engineering/integrate-signatures/references/verification-loop.md` — Verifying a ceremony actually happened
- `skills/engineering/integrate-signatures/references/webhooks.md` — Webhooks
- `skills/engineering/integrate-signatures/scripts/check-setup.mjs` — Checks credentials, mode, and API reachability
- `skills/engineering/integrate-signatures/scripts/complete-ceremony.mjs` — Branch B: drives a real browser through a ceremony (consent-gated)
- `skills/engineering/integrate-signatures/scripts/create-test-envelope.mjs` — Prints or creates a minimum viable test envelope
- `skills/engineering/integrate-signatures/scripts/lib/output.mjs` — Shared ok/fail/gap JSON output helpers for every script
- `skills/engineering/integrate-signatures/scripts/make-test-document.mjs` — Builds and uploads a throwaway test PDF
- `skills/engineering/integrate-signatures/scripts/openapi-explore.mjs` — Queries the bundled OpenAPI spec: paths, path detail, schema
- `skills/engineering/integrate-signatures/scripts/watch-events.mjs` — Polls envelope events until a terminal status
- `skills/engineering/integrate-signatures/scripts/webhook-receiver.mjs` — Local HTTP receiver that prints arriving webhook events
- `skills/engineering/integrate-signatures/SKILL.md` — SignatureAPI integration reference. Use when adding electronic signatures to an application, sending a document for signature, building or changing a signing flow, or wiring up SignatureAPI webhooks.
- `skills/engineering/troubleshoot-signatures/package-lock.json` — npm lockfile pinning this skill's dependencies for reproducible installs
- `skills/engineering/troubleshoot-signatures/package.json` — npm manifest for @signatureapi/troubleshoot-signatures (dependencies: yaml)
- `skills/engineering/troubleshoot-signatures/references/errors.md` — HTTP errors
- `skills/engineering/troubleshoot-signatures/scripts/diagnose-envelope.mjs` — Diagnoses why an envelope is stuck or missing a deliverable
- `skills/engineering/troubleshoot-signatures/scripts/lib/output.mjs` — Shared ok/fail/gap JSON output helpers for every script
- `skills/engineering/troubleshoot-signatures/SKILL.md` — SignatureAPI failure runbook. Use when an envelope is stuck in processing, a signature webhook never arrived, a recipient never got the signing email, a deliverable is missing after completion, or the API returns 422 on envelope creation.
