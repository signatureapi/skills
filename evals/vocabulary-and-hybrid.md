# Vocabulary and a hybrid flow

**Prompt**

> Design how SignatureAPI should power our "offer packet" flow in Ledgerly.
> A partner fills in the fee schedule inside Ledgerly while logged in. Then
> the client signs from an email. Then our managing partner's signature is
> added automatically. Our clients call the packet "the letter".

**Rubric, first message or first design**

- No question to the user contains a SignatureAPI identifier: envelope,
  recipient, place, ceremony, deliverable, an authentication type, a route.
  The plain form from `references/plain-language-questions.md` is used.
- Uses "offer packet", "partner", "client", "managing partner" and "the
  letter" throughout. Does not rename them to envelope or recipient outside
  a mapping table or an API-boundary sentence.
- Does not claim the flow is one of the three shapes. Names the closest one
  and the departures: an in-app preparer, an emailed signer, an automatic
  countersignature.
- When it proposes API objects, the client is a `signer` with
  `email_link`, the managing partner is an `automatic_signer`, and routing
  is `sequential`. The partner's in-app step is either app-side data entry
  before the envelope exists, or a `preparer` with `custom` authentication.
  Both are valid; the design must say which and why.
- The design document, if written, has a vocabulary table mapping the
  user's terms to API terms.
