# Ceremonies and recipients

*Reference for the SignatureAPI signatureapi-integrate skill. Test-mode
integration context, not production guidance on its own. Full workflow:
SKILL.md.*

These are the behaviours that break integrations after the first test
envelope works. Field names come from the spec; check them there.

## One live link per recipient

- A recipient has one active ceremony. Creating another revokes every
  earlier link, and the signer sees "invalid link". Create a ceremony
  once per signing session, and make the code path idempotent. A retried
  webhook handler that creates ceremonies is the usual cause.
- Email scanners, Gmail's especially, open links before the signer does.
  When the app emails a link it creates on open, point the email at an app
  page that creates the ceremony when the signer clicks.
- Ceremony links expire, after 30 days by default. For embedded signing,
  create the ceremony just before you show it. For an emailed link, resend
  it instead of reusing an old one.

## Custom authentication

`custom` means the app vouches for the signer. It needs a `provider` name
and a non-empty `data` object. Both go into the audit log. Put the evidence
that links the signing to the app's login there: user id, session id, and
when they authenticated. Read the exact shape with
`node scripts/openapi-explore.mjs schema Ceremony.CustomAuthenticationInput`.

## Embedded signing

- Set `embeddable_in` to each origin that will frame the ceremony, with its
  scheme: `https://app.example.com`, or `http://127.0.0.1:5173` in
  development. A missing origin fails with a `frame-ancestors` CSP error.
- Append `embedded=true&event_delivery=message` to the ceremony URL. The
  ceremony then posts its result to the parent window with `postMessage`.
  Check the message's origin before trusting it.
- An embedded ceremony ignores `redirect_url`. The app learns the outcome
  from the posted message and from webhooks.
- For SMS or chat delivery, set `url_variant` to `short`.

## Recipients after creation

- Documents, routing and the recipient list are fixed at creation. A
  recipient can be replaced before they sign. Anything else means
  cancelling the envelope and creating a new one.
- A recipient who declines does not cancel the envelope on their own.
  Handle `recipient.rejected`. Replace the recipient or cancel the
  envelope, as the product needs.
- Input places (text inputs, checkboxes, dropdowns, radio groups) need
  `sequential` routing when an envelope has more than one recipient.
- There are no automatic reminders. Build them with the resend endpoint.
  Resend has a cooldown, reported in `can_resend_at`, and a cap per
  recipient.

## Email in live mode

Test mode never sends email. Live mode does, so decide each kind before
going live:

- The invitation: sent when `email_link` is the first authentication
  method. Put `email_code` or `custom` first to deliver the link yourself.
- The signed document: sent to each recipient whose `delivery_type` is
  `email`. Set it to `none` to deliver it yourself.
- Owner notifications: set on the dashboard, not in the API.

A signer with no email address still needs one in the request. Use any
address at `signatureapi-null.com`; nothing is sent to it. An address that
once hard-bounced is blocked: creating an envelope for it fails with a 422
`blocked-email` error. Replace it with a corrected address.

A live key works only once live mode is active on the account, which needs
a subscription. Until then every live call returns 401
`live-mode-disabled`.
