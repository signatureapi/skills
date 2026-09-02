# HTTP errors

Error responses use RFC 7807 problem details:

```json
{ "type": "https://...", "title": "...", "status": 422, "detail": "..." }
```

`detail` is the specific, actionable part — read it first.

## Status codes

**401** — the API key was rejected. Confirm `SIGNATUREAPI_KEY` is set and current.

**403** — the key is valid but not permitted for this action.

**404** — usually a mode mismatch, not a missing resource. Test and live are
separate namespaces: a test key can never see a live envelope and vice versa.
Confirm the id's mode matches the key's mode before assuming it doesn't exist.

**409** — the envelope is already in a final state (e.g. cancelling a
completed envelope). Check `status` on the envelope first.

**422** — validation failure. `detail` names the offending field; the most
common cause is a place's `recipient_key` matching no recipient `key`.

**429** — rate limited. Back off and retry with increasing delay.

**5xx** — a server-side failure. Retry with backoff; if it persists, contact
support@signatureapi.com with the request id.
