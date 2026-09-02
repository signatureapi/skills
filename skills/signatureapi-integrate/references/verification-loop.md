# Verifying a ceremony actually happened

Creating an envelope does not prove a recipient can sign it. Two branches close
that loop — both start the same way and only diverge at the point where a human
would normally click the link.

Test mode only.

## Why this loop defaults to `custom` authentication

`create-test-envelope.mjs` defaults `--auth` to `custom`, not to the API's own
default (`email_link`). That default exists only for this verification loop —
not as a general recommendation for how to authenticate recipients. Three
authentication types behave differently on the create response:

- `email_link` (the API default, and what production envelopes typically
  use): `ceremony.url` is `null` by design, in test mode and live mode alike.
  Possession of the emailed link *is* the recipient's authentication, so the
  API never exposes it outside the email itself.
- `email_code`: `ceremony.url` is returned, but the ceremony still carries one
  unsatisfied challenge — the signer must type a code that itself only ever
  lives in the email log. This moves the email lookup to the signer's side
  without removing it.
- `custom`: `ceremony.url` is returned with no outstanding challenge. Nothing
  else needs to be fetched from anywhere to reach a completable ceremony.

Branch B drives a headless script that cannot call MCP tools, so it cannot
read the email log at all — only `custom` (or `email_code`, which still
requires a human to relay the code) gives it a URL it can act on directly.
Branch A works with any of the three, but using `custom` there too keeps one
recipe instead of two.

**`custom` authentication asserts that your application verified the
recipient's identity.** The `provider` and `data` values you pass are written
permanently into the envelope audit log, and a reader of that log later has
none of this documentation in front of them — so `create-test-envelope.mjs`'s
default values (`provider: "No identity verification performed"`, with a
`data` entry spelling out that no identity check occurred) are written to
read as a plain denial, not a claim, when read in isolation. That default is
correct for exactly two cases: a test-mode envelope built to verify an
integration end to end (this loop), and embedded signing where your
application genuinely authenticated the signer before creating the ceremony.
**It is the wrong choice for a production recipient your application has not
authenticated.** Those recipients use `email_link`, or a stronger method than
`custom` can honestly assert. Do not carry this default into production code
without re-deciding it for the recipient in front of you.

## Getting to the link

**Default (`custom`)**: the link is on the create response with nothing
further to fetch — `recipients[].ceremony.url`.

**`email_link` (the API default), or to read the `email_code` code the signer
needs**:

1. Create a test envelope with a recipient.
2. `list_emails` filtered by `envelope_id` to find the emails SignatureAPI
   generated for it.
3. Pick the `request`-type email (the signing invitation, not a receipt or
   deliverable notice).
4. `get_email` on that email's id and read `ceremony_url` (and, for
   `email_code`, the code) from the response.

If MCP is unavailable, the dashboard email log is the fallback:
`https://dashboard.signatureapi.com/emails?mode=test`.

**With `--auth email_code`**: the link is also available immediately, with no
email lookup, at `recipients[].ceremony.url` on the create response itself.
The signer still needs the code, fetched as above.

## Branch A — hand it to the human

Give the `ceremony_url` to the user and wait for them to complete the ceremony
themselves. Then confirm completion with `watch-events.mjs --envelope <id>`.

Use this branch whenever a human is available to sign. It needs no browser
automation and carries no consent requirement.

## Branch B — walk it yourself

When no human is available and the user has explicitly agreed to a real,
automated browser session:

```
node scripts/complete-ceremony.mjs --envelope <envelope id> --i-consent
```

The script resolves the ceremony URL itself: it fetches the envelope with your
`SIGNATUREAPI_KEY`, which is the actual test-mode gate — a test key can only
ever see a test envelope, so there is no way to point this at a live ceremony
by accident. It reads `recipients[].ceremony.url` from the response (picking
the first recipient with a non-null one, or the one named by `--recipient
<key>`). This is why the loop defaults to `custom`: the script cannot call
MCP, so `email_link`'s null URL is a dead end here, not just an extra step.
If every ceremony URL is `null`, it fails with `CEREMONY_URL_NOT_RETURNED` —
switch that recipient's authentication to `custom` or `email_code`, or fall
back to the email log as in Branch A.

It then drives a real Chromium browser through the ceremony — genuine pointer
movement to arm completion, then the primary signing action, with a consent
modal handled as a fallback if organic input wasn't detected. Requires
Playwright to be installed in the project (`npm install --save-dev playwright
&& npx playwright install chromium`); the script reports `PLAYWRIGHT_MISSING`
with that install command if it isn't.

If you already have both the envelope id and the URL (for example, resolved
via `list_emails` → `get_email` under `email_link`), pass both:
`--envelope <id> --url <url>`. The envelope fetch proves test mode and that
the supplied URL belongs to one of its ceremonies, and the browser walk uses
the URL you supplied without re-deriving it from the envelope response.

`--url` alone, with no `--envelope`, is refused outright: an unverified URL
cannot be proven to belong to a test-mode ceremony, and there is no flag to
accept that risk instead — this script has no code path that can run against
a live ceremony. Always pass `--envelope`, with or without `--url` alongside
it.

After it reports `walked: true`, confirm completion with
`watch-events.mjs --envelope <id>` — the same verification step as Branch A.
