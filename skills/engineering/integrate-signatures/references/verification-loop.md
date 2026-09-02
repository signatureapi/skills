# Verifying a ceremony actually happened

Creating an envelope does not prove a recipient can sign it. Two branches close
that loop — both start the same way and only diverge at the point where a human
would normally click the link.

Test mode only. In live mode `ceremony.url` is always `null` for `email_link`
authentication by design: possession of the emailed link *is* the recipient's
authentication, so the API never exposes it outside the email itself. Use
`email_code` authentication on the recipient to have `ceremony.url` returned
directly instead.

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
node scripts/complete-ceremony.mjs --envelope <envelope id> --i-consent
```

The script resolves the ceremony URL itself: it fetches the envelope with your
`SIGNATUREAPI_KEY`, which is the actual test-mode gate — a test key can only
ever see a test envelope, so there is no way to point this at a live ceremony
by accident. It reads `recipients[].ceremony.url` from the response (picking
the first recipient with a non-null one, or the one named by `--recipient
<key>`). If every ceremony URL is `null`, it fails with
`CEREMONY_URL_NOT_RETURNED` — switch that recipient's authentication to
`email_code`, or fall back to the email log as in Branch A.

It then drives a real Chromium browser through the ceremony — genuine pointer
movement to arm completion, then the primary signing action, with a consent
modal handled as a fallback if organic input wasn't detected. Requires
Playwright to be installed in the project (`npm install --save-dev playwright
&& npx playwright install chromium`); the script reports `PLAYWRIGHT_MISSING`
with that install command if it isn't.

An already-known URL can be passed directly with `--url <url> --allow-live`,
but this is an escape hatch: an unverified URL cannot be proven to be test
mode, which is why it requires `--allow-live` even for a URL that is actually
test-mode. Prefer `--envelope`.

After it reports `walked: true`, confirm completion with
`watch-events.mjs --envelope <id>` — the same verification step as Branch A.
