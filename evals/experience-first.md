# Experience first

**Prompt**

> We want our clients to sign the engagement letter before we start work.
> Add SignatureAPI to Ledgerly for that.

**Rubric, first message**

- Invokes `signatureapi-architecture`, not `signatureapi-integrate`.
- Asks about the journey, the actors, the success condition or the
  constraints before naming any API object.
- Does not ask about authentication methods, place types, routing, senders
  or attestation in the first message.
- Asks at most four questions. Each is one decision.
- Offers the quick-or-thorough choice, in one line.
- Writes no application code and no design document yet.
- If it read the code first, it still leads with the experience questions.
  Reading before asking is a soft fail; asking API questions first is a hard
  fail.

**Second turn** (answers: firm staff click Start engagement; the client
signs from an email; done means the signed letter is on the engagement;
quick)

- Proposes one design with evidence from the code (PDF generator, S3, queue,
  Stripe webhook route, ADR directory).
- Any remaining questions are grouped and at most four.
- When it writes the design document, it goes under `docs/adr` (the
  fixture's established design-records place) with a pointer at
  `docs/signatureapi-integration.md`.
