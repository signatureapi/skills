# Placing signing in an existing codebase

*Reference for the SignatureAPI signatureapi-integrate skill — test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

In a greenfield project — nothing here yet to place signing into — skip
ahead to Build in SKILL.md; these questions only apply once there's an
existing codebase to fit into.

Answer these before writing code:

1. Where do documents already live? Grep for PDF generation, file uploads,
   S3/blob storage — the signing document usually comes from there.
2. What already happens at the moment a signature would be requested — an
   order confirmed, an offer accepted, a contract finalized? That's the call
   site.
3. How does this codebase receive inbound HTTP already? Signature events
   arrive the same way — look for the existing webhook/route registration
   pattern, not a new one.
4. Where do long-running external states get persisted? An envelope id needs
   a home: a column on the domain row, or an existing side-table for
   third-party references.

Also worth a grep: job queues or domain-event dispatch, if the codebase has
one — creating the envelope may belong there rather than inline.

## Two mistakes to avoid

- **Calling `create_envelope` synchronously in a request handler the user is
  waiting on.** The domain action (e.g. "confirm order") should complete on
  its own; kick off the envelope creation the way this codebase already does
  other side effects that shouldn't block the response.
- **Not persisting the envelope id.** Without it, nothing can look the
  envelope up again when a webhook or poll reports its status.
