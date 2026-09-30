import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import * as ceremony from "../skills/signatureapi-integrate/scripts/complete-ceremony.mjs";

const {
  collectCeremonyUrls,
  extractCeremonyId,
  checkSuppliedUrlAgainstEnvelope,
  pollForRecipientCompletion,
} = ceremony;

/** A ceremony URL shaped like the real ones: a JWT `token` query param whose
 * payload carries `ceremony_id`. Header/signature content doesn't matter for
 * these tests — only the payload segment is read. */
function ceremonyUrl(ceremonyId, { origin = "https://sign.signatureapi.dev", iat = Date.now() } = {}) {
  const payload = Buffer.from(JSON.stringify({ ceremony_id: ceremonyId, iat })).toString("base64url");
  return `${origin}/en/start?token=header.${payload}.signature`;
}

const ceremonyIdA = "ce_aaaaaaaaaaaaaaaaaaaaaa";
const ceremonyIdB = "ce_bbbbbbbbbbbbbbbbbbbbbb";

const envelopeWithUrl = {
  recipients: [{ key: "signer", ceremony: { url: ceremonyUrl(ceremonyIdA, { iat: 1 }) } }],
};

const envelopeWithNoUrls = {
  recipients: [{ key: "signer", ceremony: { url: null } }],
};

const envelopeWithTwoRecipients = {
  recipients: [
    { key: "a", ceremony: { url: ceremonyUrl(ceremonyIdA, { iat: 1 }) } },
    { key: "b", ceremony: { url: null } },
  ],
};

test("extractCeremonyId reads the ceremony_id claim out of the token query param", () => {
  assert.equal(extractCeremonyId(ceremonyUrl(ceremonyIdA)), ceremonyIdA);
});

test("extractCeremonyId returns null for a url with no parseable token", () => {
  assert.equal(extractCeremonyId("https://sign.signatureapi.dev/en/start"), null);
  assert.equal(extractCeremonyId("not a url"), null);
});

test("collectCeremonyUrls returns every non-null ceremony url", () => {
  assert.deepEqual(collectCeremonyUrls(envelopeWithUrl), [envelopeWithUrl.recipients[0].ceremony.url]);
  assert.deepEqual(collectCeremonyUrls(envelopeWithNoUrls), []);
});

test("collectCeremonyUrls scopes to a recipient key when given", () => {
  assert.deepEqual(collectCeremonyUrls(envelopeWithTwoRecipients, "a"), [envelopeWithTwoRecipients.recipients[0].ceremony.url]);
  assert.deepEqual(collectCeremonyUrls(envelopeWithTwoRecipients, "b"), []);
});

test("checkSuppliedUrlAgainstEnvelope passes when the ceremony_id matches, even though the token string differs (re-minted on every fetch)", () => {
  // Same ceremony_id as envelopeWithUrl, but a freshly-minted token (different
  // iat, different signature bytes) — this reproduces what a real second
  // fetch of the same untouched envelope returns.
  const freshlyFetchedUrl = ceremonyUrl(ceremonyIdA, { iat: 999999 });
  assert.notEqual(freshlyFetchedUrl, envelopeWithUrl.recipients[0].ceremony.url);
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithUrl, freshlyFetchedUrl, undefined);
  assert.deepEqual(result, { ok: true });
});

test("checkSuppliedUrlAgainstEnvelope fails URL_ENVELOPE_MISMATCH for a different ceremony_id", () => {
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithUrl, ceremonyUrl(ceremonyIdB), undefined);
  assert.equal(result.ok, false);
  assert.equal(result.code, "URL_ENVELOPE_MISMATCH");
});

test("checkSuppliedUrlAgainstEnvelope fails URL_ENVELOPE_MISMATCH for the right ceremony_id on the wrong origin", () => {
  const spoofed = ceremonyUrl(ceremonyIdA, { origin: "https://evil.example.com" });
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithUrl, spoofed, undefined);
  assert.equal(result.ok, false);
  assert.equal(result.code, "URL_ENVELOPE_MISMATCH");
});

test("checkSuppliedUrlAgainstEnvelope fails EMAIL_LINK_URL_UNVERIFIABLE when the envelope has no ceremony urls, with no flag able to excuse it", () => {
  const result = checkSuppliedUrlAgainstEnvelope(envelopeWithNoUrls, ceremonyUrl(ceremonyIdA), undefined);
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMAIL_LINK_URL_UNVERIFIABLE");
});

test("checkSuppliedUrlAgainstEnvelope has no parameter that can let an unverifiable url through", () => {
  assert.equal(checkSuppliedUrlAgainstEnvelope.length, 3);
});

test("ceremonyUrlUnavailable sends email-link ceremonies to the human branch without suggesting --url", () => {
  assert.equal(typeof ceremony.ceremonyUrlUnavailable, "function");
  const result = ceremony.ceremonyUrlUnavailable();
  assert.equal(result.code, "CEREMONY_URL_NOT_RETURNED");
  assert.match(result.next.join("\n"), /Branch A/);
  assert.doesNotMatch(result.next.join("\n"), /--url|re-run/);
});

// I1: pollForRecipientCompletion used to default to recipients[0] whenever
// recipientKey was falsy — reachable when the ceremony URL's ceremony_id
// claim couldn't be parsed — which on a multi-recipient envelope could
// verify a recipient who was already `completed` before this walk started,
// reporting `verified: true` for a walk that signed nothing. It must now
// refuse instead of guessing, without ever calling fetch to do so.
test("pollForRecipientCompletion refuses with a distinct code when recipientKey could not be resolved, without fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("pollForRecipientCompletion should not have called fetch");
  };
  try {
    const result = await pollForRecipientCompletion({
      api: "https://api.signatureapi.dev/v1",
      envelopeId: "env_123",
      recipientKey: null,
      key: "key_test_abc",
      timeoutMs: 50,
    });
    assert.equal(result.completed, false);
    assert.equal(result.code, "RECIPIENT_KEY_UNRESOLVED");
    assert.equal(result.recipient, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pollForRecipientCompletion still resolves a matching, explicitly-keyed recipient", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: "in_progress",
      recipients: [
        { key: "a", status: "completed" },
        { key: "b", status: "in_progress" },
      ],
    }),
  });
  try {
    const result = await pollForRecipientCompletion({
      api: "https://api.signatureapi.dev/v1",
      envelopeId: "env_123",
      recipientKey: "b",
      key: "key_test_abc",
      timeoutMs: 50,
      intervalMs: 10,
    });
    // Recipient "b" never reaches completed within the short timeout, so
    // this should time out rather than complete — and crucially it must
    // check "b", not silently succeed against "a" (recipients[0]), which
    // is already completed.
    assert.equal(result.completed, false);
    assert.notEqual(result.code, "RECIPIENT_KEY_UNRESOLVED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --embedded: event parsing, URL building, embed origin and classification.
// The browser path is not driven here; these pure functions decide what
// counts as a delivered event, so they carry the fail-closed rules.
const {
  parseRedirectEvent,
  parseMessageEvent,
  embeddedCeremonyUrl,
  pickEmbedOrigin,
  embedOriginFor,
  renderHostPage,
  classifyDeliveredEvents,
  readFlag,
  stepNotFoundOutcome,
} = ceremony;

const redirectCases = [
  ["signatureapi-message://ceremony.completed/?", { type: "ceremony.completed" }],
  ["signatureapi-message://ceremony.canceled/", { type: "ceremony.canceled" }],
  [
    "signatureapi-message://ceremony.failed/?error_type=unauthorized&error_message=The+link+is+no+longer+valid.",
    { type: "ceremony.failed", error_type: "unauthorized", error_message: "The link is no longer valid." },
  ],
  ["signatureapi-message://ceremony.declined/?unrelated=1", { type: "ceremony.declined" }],
];
for (const [input, expected] of redirectCases) {
  test(`parseRedirectEvent reads ${input}`, () => {
    assert.deepEqual(parseRedirectEvent(input), expected);
  });
}

for (const input of ["https://sign.signatureapi.com/en/start?token=x", "signatureapi-message:", "not a url", "", undefined]) {
  test(`parseRedirectEvent returns null for ${JSON.stringify(input)}`, () => {
    assert.equal(parseRedirectEvent(input), null);
  });
}

const messageCases = [
  [{ type: "ceremony.completed" }, { type: "ceremony.completed" }],
  [{ type: "ceremony.failed", error_type: "not_available", error_message: "x", extra: 1 }, { type: "ceremony.failed", error_type: "not_available", error_message: "x" }],
  ["ceremony.completed", { type: null }],
  [null, { type: null }],
  [[{ type: "ceremony.completed" }], { type: null }],
  [{ type: 7 }, { type: null }],
];
for (const [input, expected] of messageCases) {
  test(`parseMessageEvent maps ${JSON.stringify(input)}`, () => {
    assert.deepEqual(parseMessageEvent(input), expected);
  });
}

for (const delivery of ["redirect", "message"]) {
  test(`embeddedCeremonyUrl adds embedded=true and event_delivery=${delivery}, keeping the token`, () => {
    const source = ceremonyUrl(ceremonyIdA);
    const url = new URL(embeddedCeremonyUrl(source, delivery));
    assert.equal(url.searchParams.get("embedded"), "true");
    assert.equal(url.searchParams.get("event_delivery"), delivery);
    assert.equal(url.searchParams.get("token"), new URL(source).searchParams.get("token"));
    assert.equal(extractCeremonyId(url.toString()), ceremonyIdA);
  });
}

test("embeddedCeremonyUrl replaces an existing event_delivery instead of adding a second one", () => {
  const url = new URL(embeddedCeremonyUrl(`${ceremonyUrl(ceremonyIdA)}&event_delivery=none`, "redirect"));
  assert.deepEqual(url.searchParams.getAll("event_delivery"), ["redirect"]);
});

for (const delivery of ["none", "", undefined, "postMessage"]) {
  test(`embeddedCeremonyUrl refuses delivery ${JSON.stringify(delivery)}`, () => {
    assert.throws(() => embeddedCeremonyUrl(ceremonyUrl(ceremonyIdA), delivery));
  });
}

const originCases = [
  [["https://app.example.com"], "https://app.example.com"],
  [["https://app.example.com/path/page"], "https://app.example.com"],
  [["app.example.com"], "https://app.example.com"],
  [["https://app.example.com:8443"], "https://app.example.com:8443"],
  [["https://*.example.com", "https://app.example.com"], "https://app.example.com"],
  [["http://localhost:5173"], "http://localhost:5173"],
  [["http://127.0.0.1:8080"], "http://127.0.0.1:8080"],
  [["http://[::1]:8080"], "http://[::1]:8080"],
  [["http://[::1]"], "http://[::1]"],
  [["[::1]:8443"], "https://[::1]:8443"],
  [["*"], null],
  [["https://*"], null],
  // A CSP3 host-source http://x also matches https://x, so it is upgraded.
  [["http://app.example.com"], "https://app.example.com"],
  [["http://app.example.com:8080/embed"], "https://app.example.com:8080"],
  [["http://app.example.com", "http://localhost:5173"], "https://app.example.com"],
  [["ftp://app.example.com", "https://ok.example.com"], "https://ok.example.com"],
  [["", "  "], null],
  [[], null],
  [null, null],
  [[42, "https://app.example.com"], "https://app.example.com"],
];
for (const [input, expected] of originCases) {
  test(`pickEmbedOrigin(${JSON.stringify(input)}) is ${JSON.stringify(expected)}`, () => {
    assert.equal(pickEmbedOrigin(input), expected);
  });
}

test("embedOriginFor fails closed with EMBED_ORIGIN_MISSING and points at embeddable_in", () => {
  const result = embedOriginFor({ key: "signer", ceremony: { embeddable_in: [] } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMBED_ORIGIN_MISSING");
  assert.match(result.next.join("\n"), /embeddable_in/);
});

test("embedOriginFor refuses an unresolved recipient instead of guessing", () => {
  const result = embedOriginFor(null);
  assert.equal(result.ok, false);
  assert.equal(result.code, "RECIPIENT_KEY_UNRESOLVED");
});

test("embedOriginFor returns the recipient's first usable origin", () => {
  assert.deepEqual(embedOriginFor({ key: "signer", ceremony: { embeddable_in: ["https://app.example.invalid"] } }), {
    ok: true,
    origin: "https://app.example.invalid",
  });
});

test("renderHostPage escapes the iframe src", () => {
  const src = `${embeddedCeremonyUrl(ceremonyUrl(ceremonyIdA), "message")}&x="<y>`;
  const html = renderHostPage(src, "__bridge");
  assert.doesNotMatch(html, /x="<y>/);
});

/**
 * Runs the host page's script against a stub window and iframe, and returns
 * a function that dispatches one message event and yields what the page
 * forwarded to the bridge.
 */
function runHostPageScript(ceremonySrc) {
  const html = renderHostPage(ceremonySrc, "__bridge");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "the host page has an inline script");
  const frameWindow = { name: "ceremony frame" };
  const listeners = [];
  const forwarded = [];
  const window = {
    addEventListener: (type, fn) => {
      if (type === "message") listeners.push(fn);
    },
    __bridge: (raw) => forwarded.push(JSON.parse(raw)),
  };
  const document = {
    getElementById: (id) => (id === ceremony.HOST_PAGE_FRAME_ID ? { contentWindow: frameWindow } : null),
  };
  vm.runInNewContext(script, { window, document });
  assert.equal(listeners.length, 1);
  return {
    frameWindow,
    dispatch(event) {
      forwarded.length = 0;
      for (const fn of listeners) fn(event);
      return [...forwarded];
    },
  };
}

const hostPageOrigin = "https://sign.signatureapi.dev";
const hostPageCases = [
  {
    name: "the ceremony origin from the ceremony frame is forwarded as an event",
    origin: hostPageOrigin,
    fromFrame: true,
    expected: [{ kind: "event", data: { type: "ceremony.completed" } }],
  },
  {
    name: "another origin from the ceremony frame is rejected",
    origin: "https://evil.example.com",
    fromFrame: true,
    expected: [{ kind: "rejected", origin: "https://evil.example.com" }],
  },
  {
    name: "the ceremony origin from another window is rejected",
    origin: hostPageOrigin,
    fromFrame: false,
    expected: [{ kind: "rejected", origin: hostPageOrigin }],
  },
  {
    name: "another origin from another window is rejected",
    origin: "https://evil.example.com",
    fromFrame: false,
    expected: [{ kind: "rejected", origin: "https://evil.example.com" }],
  },
];
for (const c of hostPageCases) {
  test(`renderHostPage script: ${c.name}`, () => {
    const host = runHostPageScript(embeddedCeremonyUrl(ceremonyUrl(ceremonyIdA, { origin: hostPageOrigin }), "message"));
    const source = c.fromFrame ? host.frameWindow : { name: "some other window" };
    const forwarded = host.dispatch({ origin: c.origin, source, data: { type: "ceremony.completed" } });
    assert.deepEqual(forwarded, c.expected);
  });
}

const flagCases = [
  { argv: ["--embedded", "message"], expected: { present: true, value: "message" } },
  { argv: ["--embedded=message"], expected: { present: true, value: "message" } },
  { argv: ["--embedded=redirect", "--envelope", "env_1"], expected: { present: true, value: "redirect" } },
  { argv: ["--embedded="], expected: { present: true, value: "" } },
  { argv: ["--embedded"], expected: { present: true, value: undefined } },
  { argv: ["--embedded", "--envelope", "env_1"], expected: { present: true, value: undefined } },
  { argv: ["--envelope", "env_1"], expected: { present: false, value: undefined } },
  { argv: ["--embeddedx=message"], expected: { present: false, value: undefined } },
  { argv: [], expected: { present: false, value: undefined } },
];
for (const c of flagCases) {
  test(`readFlag(${JSON.stringify(c.argv)}, "embedded") is ${JSON.stringify(c.expected)}`, () => {
    assert.deepEqual(readFlag(c.argv, "embedded"), c.expected);
  });
}

for (const name of ["url", "envelope", "recipient", "timeout"]) {
  test(`readFlag reads --${name}=<value> the same as --${name} <value>`, () => {
    assert.deepEqual(readFlag([`--${name}=v1`], name), readFlag([`--${name}`, "v1"], name));
  });
}

const stepNotFoundCases = [
  {
    name: "no event gives CEREMONY_WALK_STEP_NOT_FOUND",
    events: [],
    via: "message",
    code: "CEREMONY_WALK_STEP_NOT_FOUND",
  },
  {
    name: "a ceremony.failed delivered at load names its error_type",
    events: [{ type: "ceremony.failed", error_type: "already_completed", via: "redirect" }],
    via: "redirect",
    code: "CEREMONY_EVENT_UNEXPECTED",
    messageMatch: /already_completed/,
  },
  {
    name: "a ceremony.canceled is reported instead of the missing step",
    events: [{ type: "ceremony.canceled", via: "message" }],
    via: "message",
    code: "CEREMONY_EVENT_UNEXPECTED",
  },
  {
    name: "a lone ceremony.completed still reports the missing step",
    events: [{ type: "ceremony.completed", via: "message" }],
    via: "message",
    code: "CEREMONY_WALK_STEP_NOT_FOUND",
  },
];
for (const c of stepNotFoundCases) {
  test(`stepNotFoundOutcome: ${c.name}`, () => {
    const result = stepNotFoundOutcome({ events: c.events, via: c.via, step: "clicking Start", name: "Start" });
    assert.equal(result.ok, false);
    assert.equal(result.code, c.code);
    assert.ok(Array.isArray(result.next) && result.next.length > 0);
    if (c.messageMatch) assert.match(result.message, c.messageMatch);
  });
}

const classifyCases = [
  {
    name: "exactly one ceremony.completed via the expected path passes",
    events: [{ type: "ceremony.completed", via: "redirect" }],
    via: "redirect",
    ok: true,
  },
  { name: "no event fails", events: [], via: "redirect", code: "CEREMONY_EVENT_NOT_DELIVERED" },
  { name: "a missing list fails", events: undefined, via: "message", code: "CEREMONY_EVENT_NOT_DELIVERED" },
  {
    name: "two completed events fail",
    events: [{ type: "ceremony.completed", via: "message" }, { type: "ceremony.completed", via: "message" }],
    via: "message",
    code: "CEREMONY_EVENT_UNEXPECTED",
  },
  {
    name: "ceremony.failed fails and names its error_type",
    events: [{ type: "ceremony.failed", error_type: "already_completed", via: "redirect" }],
    via: "redirect",
    code: "CEREMONY_EVENT_UNEXPECTED",
    messageMatch: /already_completed/,
  },
  { name: "ceremony.canceled fails", events: [{ type: "ceremony.canceled", via: "message" }], via: "message", code: "CEREMONY_EVENT_UNEXPECTED" },
  { name: "an unreadable message fails", events: [{ type: null, via: "message" }], via: "message", code: "CEREMONY_EVENT_UNEXPECTED" },
  {
    name: "completed through the wrong path fails",
    events: [{ type: "ceremony.completed", via: "message" }],
    via: "redirect",
    code: "CEREMONY_EVENT_UNEXPECTED",
  },
];
for (const c of classifyCases) {
  test(`classifyDeliveredEvents: ${c.name}`, () => {
    const result = classifyDeliveredEvents(c.events, { expected: "ceremony.completed", via: c.via });
    if (c.ok) {
      assert.deepEqual(result, { ok: true, event: { type: "ceremony.completed", via: c.via } });
      return;
    }
    assert.equal(result.ok, false);
    assert.equal(result.code, c.code);
    assert.ok(Array.isArray(result.next) && result.next.length > 0);
    if (c.messageMatch) assert.match(result.message, c.messageMatch);
  });
}
