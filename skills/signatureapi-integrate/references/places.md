# Places

*Reference for the SignatureAPI signatureapi-integrate skill. Test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

A place is an interactive region on a document. It is bound to one recipient
by `recipient_key`, which must match that recipient's `key` exactly.

The list of place types, the fields each type takes, and the constraints on
`key` live in the spec, not here. Read them from it before writing a place:

    node scripts/openapi-explore.mjs schema Place.Type
    node scripts/openapi-explore.mjs schema Place.PlaceInput

`Place.Type` is the complete list of types, with a line on what each one does
(signature, initials, text inputs, checkbox, dropdown, radio group, dates,
recipient name and email). `Place.PlaceInput` names the schema for each type.
If anything in this file and that output disagree, the spec wins.

## Binding to a document

**Default: a `[[place_key]]` marker in the document text**, for example
`[[signer_signature]]`. SignatureAPI finds the marker and places the field
there. This is the default because it is verifiable. Open the document and
you see exactly where the field will land. The marker survives most later
edits to the document.

**Fallback: `fixed_positions`.** Explicit page/x/y/width/height coordinates.
Use this only when you cannot edit the document to add a marker, for example
a third-party or generated PDF whose source you do not control. Coordinates
guessed without a preview of the rendered result are a common source of
misplaced fields. If you use `fixed_positions`, generate the envelope, then
open the resulting document or a test render. Confirm placement before
treating the integration as done.
