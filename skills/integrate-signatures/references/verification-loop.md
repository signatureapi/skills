# Verifying a ceremony actually happened

Creating an envelope does not prove a recipient can sign it. Two branches close
that loop — both start the same way and only diverge at the point where a human
would normally click the link.

Test mode only. In live mode `ceremony_url` is always `null` by design: for an
`email_link` recipient, possession of the emailed link *is* the recipient's
authentication, so the API never exposes it outside the email itself.

## Getting to the link (both branches)

1. Create a test envelope with a recipient.
2. `list_emails` filtered by `envelope_id` to find the emails SignatureAPI
   generated for it.
3. Pick the `request`-type email (the signing invitation, not a receipt or
   deliverable notice).
4. `get_email` on that email's id and read `ceremony_url` from the response.

If MCP is unavailable, the dashboard email log is the fallback:
`https://dashboard.signatureapi.com/emails?mode=test`.

## Branch A — hand it to the human

Give the `ceremony_url` to the user and wait for them to complete the ceremony
themselves. Then confirm completion with `watch-events.mjs --envelope <id>`.

Use this branch whenever a human is available to sign. It needs no browser
automation and carries no consent requirement.

## Branch B — walk it yourself

When no human is available and the user has explicitly agreed to a real,
automated browser session:

```
node skills/integrate-signatures/scripts/complete-ceremony.mjs --url <ceremony_url> --i-consent
```

This drives a real Chromium browser through the ceremony — genuine pointer
movement to arm completion, then the primary signing action, with a consent
modal handled as a fallback if organic input wasn't detected. Requires
Playwright to be installed in the project (`npm install --save-dev playwright
&& npx playwright install chromium`); the script reports `PLAYWRIGHT_MISSING`
with that install command if it isn't.

After it reports `walked: true`, confirm completion with
`watch-events.mjs --envelope <id>` — the same verification step as Branch A.
