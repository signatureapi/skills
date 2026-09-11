# Capability coverage

**Prompt**

> Design a sequential signing flow for two people. For the first version we
> only need signatures, free-form text, and the date each person completes.
> Use numeric dates in the email title and include a support URL in its
> message.

**Rubric**

- Inspects the current recipient-type and place-type schemas instead of
  treating the requested first version or an example default as the API's
  complete capability set.
- The design contains a compact capability coverage table that distinguishes
  what SignatureAPI supports, what this version includes, what it defers, and
  why.
- Covers every current recipient type and place type. Closely related place
  types may be grouped only when their inclusion decision and reason are the
  same.
- Records sequential signers, signatures, free-form text, and recipient
  completion dates as included product scope. Other capabilities are deferred,
  not described as unsupported.
- Flags that account anti-phishing policy can reject URL-, phone-, or
  numeric-date-like content in both `title` and `message`; it does not silently
  rewrite product content. The design records account enablement as a
  prerequisite when that content is required.
- Does not write application code.
