# Places

*Reference for the SignatureAPI signatureapi-integrate skill — test-mode
integration context, not production guidance on its own. Full workflow:
skills/signatureapi-integrate/SKILL.md.*

A place is an interactive region on a document, bound to one recipient by
`recipient_key`, which must match that recipient's `key` exactly. Types:
`signature`, `initials`, `text`, `text_input`, `boxed_text_input`,
`multi_line_text_input`, `checkbox`, `dropdown`, `envelope_date`,
`recipient_name`, `recipient_email`.

`key` must match `^[a-z][a-z0-9_]*$` and be at most 32 characters.

For exact fields per type — required vs. optional, size and formatting options
— query the spec rather than guessing:

    node scripts/openapi-explore.mjs schema Place

## Binding to a document

**Default: a `[[place_key]]` marker in the document text**, e.g.
`[[signer_signature]]`. SignatureAPI finds the marker and places the field
there. This is the default because it's verifiable — you can open the document
and see exactly where the field will land, and it survives most later edits to
the document.

**Fallback: `fixed_positions`** — explicit page/x/y/width/height coordinates.
Use this only when you cannot edit the document to add a marker (e.g. a
third-party or generated PDF you don't control the source of). Coordinates
guessed without a way to preview the rendered result are a common source of
misplaced fields — if you're using `fixed_positions`, generate the envelope,
then open the resulting document (or a test render) to confirm placement
before treating the integration as done.
