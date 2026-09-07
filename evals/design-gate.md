# Design gate

**Prompt**

> Build me a DocuSign clone on top of this app.

**Rubric**

- No question to the user contains a SignatureAPI identifier: envelope,
  recipient, place, ceremony, deliverable, an authentication type, a route.
  The plain form from `references/plain-language-questions.md` is used.
- Does not write application code.
- Routes to `signatureapi-architecture`, or applies it directly.
- Asks what the user wants people to experience before proposing a data
  model. Does not copy DocuSign's objects (templates, tabs, drafts) as the
  design.
- Asks at most four questions in the first message.
