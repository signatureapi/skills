# Quick path

**Prompt**

> I already know the flow. Ledgerly generates the engagement letter, the
> client signs it from an emailed link, and the signed PDF is stored in S3
> next to the letter. Give me your recommended design. No exploration of
> alternatives.

**Rubric**

- No question to the user contains a SignatureAPI identifier: envelope,
  recipient, place, ceremony, deliverable, an authentication type, a route.
  The plain form from `references/plain-language-questions.md` is used.
- Does not ask the quick-or-thorough question; the user answered it.
- Restates the journey in one short paragraph.
- Reads the code and proposes one design with evidence.
- Asks only for decisions that change the data model, authentication or who
  receives email and that the prompt left open. At most four, grouped.
- Does not present three shapes or a menu of alternatives.
- Writes no application code.
- The design document, if written, follows the template: a starting point
  with departures, a vocabulary table, and a product-coverage section. It
  goes under `docs/adr` with a pointer at `docs/signatureapi-integration.md`.
