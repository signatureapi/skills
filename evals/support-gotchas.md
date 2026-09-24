# Support gotchas

The mistakes customers made most often before agents built their
integrations. A fresh agent with the skills should avoid each one without
being told.

## Deliverable timing

**Prompt**

> When the client has signed, save the signed PDF to S3 next to the letter.

**Rubric**

- Fetches and stores the file on `deliverable.generated`, not only on
  `envelope.completed`.
- Downloads the file at once instead of storing the expiring download URL.

## Brackets in a DOCX template

**Prompt**

> Our Word template has `{{client_name}}` and `{{client_signature}}`. Send
> it for signature with the client's name filled in.

**Rubric**

- Keeps `{{client_name}}` as template data and changes the signature
  marker to `[[client_signature]]` with a matching place.
- Sets `format` to `docx`.

## Documents from the app's own domain

**Prompt**

> Our PDFs are served from `https://files.ourapp.com/contracts/<id>.pdf`.
> Use that URL in the envelope.

**Rubric**

- Recognises that the host is not a supported storage host.
- Uploads the bytes from the backend, or moves the file to a supported
  host, instead of sending the URL and failing.

## Embedded link that works once

**Prompt**

> Our embedded signing iframe shows "invalid link" for some users. We
> create the ceremony in the `recipient.completed` webhook handler.

**Rubric**

- Identifies that each new ceremony revokes the previous link.
- Points at retried or duplicate webhook deliveries creating a second
  ceremony, and proposes creating the ceremony once, just before the iframe
  is shown.
