#!/usr/bin/env node
// Part of the SignatureAPI signatureapi-integrate skill. Branch B of the
// verification loop: drives a real Chromium browser through a test-mode
// signing ceremony, then verifies completion against the API rather than
// trusting the browser walk finishing without error. Test-mode tooling,
// not production code, and cannot be pointed at a live key — see
// SKILL.md for the full workflow.
//
// Design rule, applied everywhere in this file: every guard in this script
// fails closed. If a check cannot be evaluated — a selector that should
// match one element matches more or errors, a recipient that can't be
// identified, a control whose label can't be read — it refuses, loudly,
// rather than treating "I don't know" as "must be fine". This repo has
// shipped three separate defects that were all the same shape: a failure
// path that quietly degraded into a reported success (a walker that printed
// `walked: true` when nothing happened; a decline guard that permitted a
// click when it couldn't read a label; a swallowed selector error that
// skipped a whole step while `noteFallbackIfUsed` still reported the
// contract satisfied). None of that is allowed here anymore.
import { ok, fail, requireTestKey } from "./lib/output.mjs";

const API = process.env.SIGNATUREAPI_BASE_URL ?? "https://api.signatureapi.com/v1";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/**
 * A ceremony URL carries a fresh, re-signed JWT on every fetch (SignatureAPI
 * mints a new `iat`/`exp`/signature each time `GET /envelopes/{id}` is
 * called — confirmed on staging: two fetches of the same untouched envelope
 * a second apart return two different URLs). So the URL string itself is not
 * a stable identifier and cannot be compared byte-for-byte across two
 * separate reads. The `ceremony_id` claim inside the token IS stable across
 * fetches; extracting it is the only way to recognize "the same ceremony" in
 * two URLs obtained at different times, since a ceremony has no id field of
 * its own to resolve independently (no id field on Ceremony, no GET for it).
 */
export function extractCeremonyId(url) {
  try {
    const token = new URL(url).searchParams.get("token");
    if (!token) return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json);
    return typeof claims.ceremony_id === "string" ? claims.ceremony_id : null;
  } catch {
    return null;
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Every non-null ceremony URL on the envelope, optionally scoped to one recipient key. */
export function collectCeremonyUrls(envelope, recipientKey) {
  const recipients = envelope?.recipients ?? [];
  const candidates = recipientKey ? recipients.filter((r) => r.key === recipientKey) : recipients;
  return candidates.map((r) => r?.ceremony?.url).filter(Boolean);
}

/**
 * When both --envelope and --url are supplied, the envelope fetch alone only
 * proves the *id* is a visible test-mode envelope — it proves nothing about
 * the *URL* being driven. This ties the two together: the supplied URL must
 * belong to a ceremony this envelope actually returned. Matching is by
 * `ceremony_id` claim (see extractCeremonyId) plus origin, not literal URL
 * equality, because the URL string is re-minted on every fetch. The origin
 * check means a URL cannot pass by merely echoing a real ceremony_id from
 * some other host — the JWT's signature is still not verified here, so this
 * is not a cryptographic proof, but combined with the envelope fetch already
 * having proven test-mode visibility of the id, and the origin match ruling
 * out any host swap, it is the strongest check available without a
 * ceremony-resolution endpoint (which does not exist).
 */
export function checkSuppliedUrlAgainstEnvelope(envelope, suppliedUrl, recipientKey) {
  const urls = collectCeremonyUrls(envelope, recipientKey);

  if (urls.length === 0) {
    return {
      ok: false,
      code: "EMAIL_LINK_URL_UNVERIFIABLE",
      message: "This envelope returns no ceremony.url on any recipient (email_link authentication does this by design), so the supplied --url cannot be checked against it — there is nothing to match it to. This script cannot prove an arbitrary URL belongs to a test-mode envelope, and completing an unverified ceremony URL could sign something real.",
      next: [
        "Verify with a custom-auth envelope instead: create-test-envelope.mjs's default custom authentication returns ceremony.url on the envelope itself, so it can be checked",
        "Or use Branch A for this envelope: hand its ceremony link to a human to complete",
      ],
    };
  }

  const suppliedId = extractCeremonyId(suppliedUrl);
  const suppliedOrigin = originOf(suppliedUrl);
  const matches = urls.some(
    (u) => suppliedId && extractCeremonyId(u) === suppliedId && originOf(u) === suppliedOrigin,
  );

  if (!matches) {
    return {
      ok: false,
      code: "URL_ENVELOPE_MISMATCH",
      message: "The supplied --url does not match any ceremony this envelope returned, so it cannot be proven to belong to it. --envelope proves the id is test-mode; it does not prove the URL is that envelope's.",
      next: [
        "Use a ceremony URL this envelope actually returned (recipients[].ceremony.url from create-test-envelope.mjs or get_envelope) — fetch it fresh, the URL is re-minted on every read but its ceremony stays the same one",
      ],
    };
  }

  return { ok: true };
}

/**
 * Which recipient's ceremony the script is about to drive, so the completion
 * check at the end polls the right recipient. Prefers an explicit
 * --recipient. Otherwise matches by ceremony_id (see extractCeremonyId) plus
 * origin, the same stable-identity comparison checkSuppliedUrlAgainstEnvelope
 * uses — the URL string itself is re-minted on every fetch, so it cannot be
 * compared literally.
 */
export function resolveTargetRecipientKey(envelope, url, recipientKeyArg) {
  if (recipientKeyArg) return recipientKeyArg;
  const recipients = envelope?.recipients ?? [];
  const targetId = extractCeremonyId(url);
  if (!targetId) return null;
  const targetOrigin = originOf(url);
  const match = recipients.find((r) => {
    const rUrl = r?.ceremony?.url;
    if (!rUrl) return false;
    return extractCeremonyId(rUrl) === targetId && originOf(rUrl) === targetOrigin;
  });
  return match?.key ?? null;
}

const TERMINAL_NON_COMPLETED_RECIPIENT_STATUSES = ["rejected", "soft_bounced", "hard_bounced", "failed", "replaced"];

/**
 * The only source of truth for "did this ceremony actually complete": polls
 * GET /envelopes/{id} until the target recipient reaches `completed`, or a
 * terminal non-completed status, or the timeout expires. The browser walk
 * finishing without error proves nothing by itself — SIG-1222's found defect
 * was exactly a script that reported success after a walk whose clicks
 * silently no-op'd. This is the check that replaces that false claim.
 *
 * `recipientKey` is required — it is never defaulted to `recipients[0]`.
 * `resolveTargetRecipientKey` returns null whenever the ceremony URL's
 * `ceremony_id` claim couldn't be parsed, and on a multi-recipient envelope
 * silently checking recipients[0] in that case can verify a recipient who
 * was already `completed` before this walk even started — reporting
 * `verified: true` for a walk that signed nothing. Refusing to guess here is
 * what closes that gap.
 */
export async function pollForRecipientCompletion({ api, envelopeId, recipientKey, key, timeoutMs, intervalMs = 3000 }) {
  if (!recipientKey) {
    return {
      completed: false,
      code: "RECIPIENT_KEY_UNRESOLVED",
      envelope: null,
      recipient: null,
    };
  }
  const started = Date.now();
  let lastEnvelope = null;
  do {
    const res = await fetch(`${api}/envelopes/${envelopeId}`, { headers: { "X-API-Key": key } });
    if (res.ok) {
      lastEnvelope = await res.json();
      const recipients = lastEnvelope?.recipients ?? [];
      const recipient = recipients.find((r) => r.key === recipientKey);
      if (recipient?.status === "completed") {
        return { completed: true, envelope: lastEnvelope, recipient };
      }
      if (recipient && TERMINAL_NON_COMPLETED_RECIPIENT_STATUSES.includes(recipient.status)) {
        return { completed: false, envelope: lastEnvelope, recipient };
      }
    }
    if (Date.now() - started < timeoutMs) await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() - started < timeoutMs);
  return { completed: false, envelope: lastEnvelope, recipient: null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // No flag gates this run. An agent invokes this script non-interactively,
  // so any condition a flag could check ("has the user agreed?"), the agent
  // could already satisfy on its own initiative by simply passing it — no
  // in-band mechanism can obtain actual human consent from a non-interactive
  // session. A flag shaped like a consent gate is worse than no flag at all:
  // it invites everyone reading this script to believe something is being
  // enforced when nothing is. What actually keeps this script out of harm's
  // way is structural and enforced above, not here: requireTestKey() has no
  // bypass path, so it cannot be pointed at a live key under any argument.
  const key = requireTestKey(process.env.SIGNATUREAPI_KEY);

  const escapeHatchUrl = arg("url");
  const envelopeId = arg("envelope");

  if (escapeHatchUrl && !envelopeId) {
    fail("URL_REQUIRES_ENVELOPE", "A --url given without --envelope cannot be proven to belong to a test-mode ceremony, and there is no flag to bypass that — pass --envelope <id> alongside --url so fetching the envelope with your test key proves test mode.", [
      "node scripts/complete-ceremony.mjs --envelope <id> --url <ceremony url>",
    ]);
  }

  if (!escapeHatchUrl && !envelopeId) {
    fail("MISSING_ENVELOPE_ID", "Pass --envelope <id> (preferred) or --envelope <id> --url <ceremony url>.", [
      "node scripts/complete-ceremony.mjs --envelope <id>",
    ]);
  }

  let url = escapeHatchUrl;
  let envelope = null;
  let recipientKey = null;

  if (envelopeId) {
    // Fetching the envelope with the test key IS the mode gate: test and live
    // are separate namespaces, so a test key only ever sees a test envelope.
    // It proves the id is test-mode. It does NOT, by itself, prove that a
    // separately-supplied --url belongs to this envelope — see
    // checkSuppliedUrlAgainstEnvelope below for that check.
    recipientKey = arg("recipient");
    const res = await fetch(`${API}/envelopes/${envelopeId}`, { headers: { "X-API-Key": key } });
    // 401/403/500 are not "not visible" — collapsing them into the same
    // mode-confusion message as a genuine 404 sends the caller chasing the
    // wrong problem, and a non-2xx body is a problem-details document, not
    // an envelope, so it must never reach `envelope = await res.json()`.
    if (res.status === 401 || res.status === 403) {
      fail("API_KEY_REJECTED", `The API key was rejected (HTTP ${res.status}) fetching envelope ${envelopeId}.`, [
        "Check the key at https://dashboard.signatureapi.com/api-keys",
      ]);
    }
    if (res.status === 404) {
      fail("ENVELOPE_NOT_VISIBLE_TO_THIS_KEY", `No envelope ${envelopeId} is visible to this key. Test and live are separate namespaces, so this is not a test-mode envelope for this key.`, [
        "Confirm the key's mode: it must be a key_test_... key",
        "Use the envelope id printed by create-test-envelope.mjs",
      ]);
    }
    if (!res.ok) {
      fail("ENVELOPE_FETCH_FAILED", `HTTP ${res.status} fetching envelope ${envelopeId}.`, [
        "This is a server-side failure, not a mode/visibility problem — retry, or contact support@signatureapi.com",
      ]);
    }
    envelope = await res.json();

    if (url) {
      const check = checkSuppliedUrlAgainstEnvelope(envelope, url, recipientKey);
      if (!check.ok) {
        fail(check.code, check.message, check.next);
      }
    } else {
      const recipients = envelope?.recipients ?? [];
      const candidates = recipientKey
        ? recipients.filter((r) => r.key === recipientKey)
        : recipients;
      const recipient = candidates.find((r) => r?.ceremony?.url);

      if (!recipient) {
        fail("CEREMONY_URL_NOT_RETURNED", "ceremony.url is null for this recipient. It is null for email_link authentication (the API default) since possession of the emailed link is the recipient's authentication — and this script cannot read the email log itself.", [
          "Read the link from the email log yourself: MCP list_emails --envelope <id>, then get_email, then re-run with --url",
          "Or recreate the envelope with create-test-envelope.mjs, whose default custom authentication returns ceremony.url directly",
        ]);
      }
      url = recipient.ceremony.url;
    }
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    fail("PLAYWRIGHT_MISSING", "Playwright is not installed in this project.", [
      "npm install --save-dev playwright && npx playwright install chromium",
      "Or use Branch A instead (no browser needed)",
    ]);
  }

  // Who the completion check at the end verifies, resolved before driving
  // the browser so a typed-signature fallback has a name to use (see below).
  const targetRecipientKey = resolveTargetRecipientKey(envelope, url, recipientKey);
  const targetRecipient = (envelope?.recipients ?? []).find((r) => r.key === targetRecipientKey);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  // Arm completion with genuine pointer movement (SIG-1211 organic-input gate).
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(100 + i * 40, 150 + i * 25, { steps: 4 });
  }

  let walkLastStep = "loaded the ceremony page";

  const DECLINE_LIKE = /decline|reject|refuse/i;

  // The supported DOM contract (added alongside this change): stable
  // `data-ceremony-step` attributes on the elements each step of this walk
  // needs. This is the PRIMARY selector for every step below. The private
  // ids/labels this script used before (`#continue-consent-button`,
  // `#primary-button`/`#primary-button-inline`,
  // `button[aria-label="Sign here"]`, `#typed_symbol`, `#adopt-button`, the
  // consent/adoption checkboxes) are kept as a FALLBACK, because the new
  // attributes are not deployed to staging or production yet — a walker that
  // only understood the new contract would break against every
  // currently-deployed environment. Once every environment ships the new
  // attributes, `privateSelector` arguments below (and the fallback branch
  // of stepLocator/noteFallbackIfUsed) can be deleted.
  const fallbackStepsUsed = [];

  /** Combines the primary `data-ceremony-step` selector with the private
   * fallback selector into one Playwright locator (comma-separated CSS
   * selectors match on either). `modifier` lets a caller add a pseudo-class
   * like `:visible` to the primary half, matching what the private half
   * already carries. */
  function stepLocator(scope, dataStep, privateSelector, modifier = "") {
    return scope.locator(`[data-ceremony-step="${dataStep}"]${modifier}, ${privateSelector}`);
  }

  /** Records (and prints) when a step's match came only from the private
   * fallback selector, i.e. the new `data-ceremony-step` attribute was not
   * present — so we can see from the output when the transition to the new
   * contract is complete across environments. */
  async function noteFallbackIfUsed(scope, dataStep) {
    const primaryCount = await scope.locator(`[data-ceremony-step="${dataStep}"]`).count().catch(() => 0);
    if (primaryCount === 0) {
      fallbackStepsUsed.push(dataStep);
      console.error(`[complete-ceremony] step "${dataStep}": data-ceremony-step attribute not found, used private-id fallback selector (remove once deployed everywhere)`);
    }
  }

  /**
   * Probes an optional *container* locator (the disclosure/consent modal,
   * the signature adoption modal) and reports one of three genuinely
   * different outcomes, instead of collapsing "present" vs. everything else
   * into a boolean:
   *
   *   - "present"   exactly one element matched and became visible — proceed.
   *   - "absent"    the locator never matched anything (a real timeout with
   *                 zero matches) — the container legitimately isn't on this
   *                 page; tolerate it, the caller decides whether that's ok.
   *   - "ambiguous" the locator matched MORE than one element, or `count()`
   *                 itself errored, or `waitFor` failed for some reason
   *                 other than a plain "never appeared" timeout — refuse to
   *                 guess which element is the real one.
   *
   * This is the fix for SIG-1222's C1: `disclosure`/`adopt` used to be both
   * the checkbox attribute AND (via the private-id fallback) the container
   * selector, so once the checkboxes (rendered N-up in a `.map()`) also
   * carried a `data-ceremony-step` attribute, the combined selector matched
   * N+1 elements. Playwright's strict mode then raised on any action against
   * it, `.catch(() => false)` swallowed that into "absent", and the whole
   * step silently no-op'd while still being reported satisfied. Distinct
   * `-modal` container values (see the call sites below) fix the root
   * collision; this three-outcome check is the belt-and-suspenders so that
   * if a selector is EVER ambiguous again — for any reason — it fails loud
   * instead of disappearing into "absent".
   */
  async function probeContainer(locator, timeout) {
    let waitError = null;
    try {
      // Waiting on `.first()` avoids the wait itself throwing a strict-mode
      // error merely because there happen to be multiple matches — the
      // multiplicity is judged below, from `count()`, not from whether the
      // first match became visible.
      await locator.first().waitFor({ state: "visible", timeout });
    } catch (e) {
      waitError = e;
    }
    let count;
    try {
      count = await locator.count();
    } catch (e) {
      return { outcome: "ambiguous", detail: `count() failed: ${e?.message ?? e}` };
    }
    if (count > 1) {
      return { outcome: "ambiguous", detail: `matched ${count} elements` };
    }
    if (count === 1 && !waitError) {
      return { outcome: "present", detail: null };
    }
    if (count === 0 && waitError && /Timeout/i.test(waitError.message ?? "")) {
      return { outcome: "absent", detail: null };
    }
    // Any other combination — e.g. exactly one match but `waitFor` failed
    // for a non-timeout reason, or zero matches with a non-timeout error —
    // is not a shape this function understands. Refuse to guess.
    return { outcome: "ambiguous", detail: waitError ? (waitError.message ?? String(waitError)) : `unexpected match count ${count}` };
  }

  /**
   * Reads every accessible-name source Playwright can give us for a control
   * — visible text, `aria-label`, `title` — and joins whatever is non-blank.
   * Text content alone is blind to a whole class of control: the
   * ceremony's own signature place is labelled only by `aria-label`
   * (`button[aria-label="Sign here"]`), so a text-only check would see "" for
   * it and, under the old catch-and-default-to-"" behavior, let anything
   * through unchecked. This throws (does not catch) on a read failure —
   * callers must treat that as a refusal, not fall back to "".
   */
  async function readAccessibleLabel(locator) {
    const [text, ariaLabel, title] = await Promise.all([
      locator.textContent(),
      locator.getAttribute("aria-label"),
      locator.getAttribute("title"),
    ]);
    return [text, ariaLabel, title]
      .filter((s) => typeof s === "string" && s.trim() !== "")
      .join(" ")
      .trim();
  }

  /**
   * Click one specific, named control. Never falls through to a looser
   * match: if the control cannot be found, the walk fails loudly with what
   * WAS on the page instead of guessing at something else that might match.
   * Also refuses to click anything whose accessible label reads as a
   * decline/reject/refuse action — belt-and-suspenders on top of using
   * specific ids/labels instead of a generic "primary action" regex hunt,
   * which is what let SIG-1222's script click "Decline to sign".
   *
   * Fails closed on the label check itself: the original version read
   * `textContent()` and treated a read failure as `""`, which passes the
   * decline regex and proceeds to click — a check that can't be evaluated
   * silently became permission. Here, a label that can't be read (any of
   * text/aria-label/title throws) or that reads as nothing at all across
   * all three sources is refused, not defaulted through.
   */
  async function clickStep({ step, locator, dataStep, scope, name, timeout = 15000, required = true }) {
    walkLastStep = step;
    try {
      await locator.waitFor({ state: "visible", timeout });
    } catch {
      if (!required) return false;
      const visibleButtons = await page.getByRole("button").allTextContents().catch(() => []);
      await browser.close();
      fail("CEREMONY_WALK_STEP_NOT_FOUND", `Could not find "${name}" while ${step}.`, [
        `Buttons visible on the page at that point: ${JSON.stringify(visibleButtons.filter(Boolean))}`,
        "Re-run with PWDEBUG=1 to watch the browser",
        "The ceremony UI may differ from the sequence this script expects (place types/auth can vary) — inspect and update the selectors",
      ]);
    }
    if (dataStep) await noteFallbackIfUsed(scope ?? page, dataStep);

    let label;
    try {
      label = await readAccessibleLabel(locator);
    } catch (e) {
      await browser.close();
      fail("CEREMONY_DECLINE_LABEL_UNREADABLE", `While ${step}, could not read "${name}"'s accessible label (text content, aria-label, title) to confirm it isn't a decline/reject/refuse control. Refusing to click blind rather than assuming it's safe: ${e?.message ?? e}`, [
        "Re-run with PWDEBUG=1 to watch the browser",
        "The control may have detached or changed between locating it and reading its label",
      ]);
    }
    if (!label) {
      await browser.close();
      fail("CEREMONY_DECLINE_LABEL_UNREADABLE", `While ${step}, "${name}" has no readable accessible name (no text content, aria-label, or title matched), so there is nothing to check it against before clicking. Refusing to click blind.`, [
        "Re-run with PWDEBUG=1 to watch the browser",
        "The selector may be matching the wrong control, or the control needs a readable label",
      ]);
    }
    if (DECLINE_LIKE.test(label)) {
      await browser.close();
      fail("CEREMONY_DECLINE_CONTROL_MATCHED", `While ${step}, the "${name}" selector matched a control whose accessible label reads "${label}", which reads as a decline/reject/refuse action. Refusing to click it — signing scripts must never be able to trigger a decline.`, [
        "Narrow the selector for this step; it is matching the wrong control",
      ]);
    }
    await locator.click({ timeout });
    return true;
  }

  /**
   * Checks every agreement checkbox within a container. `dataStep` selects
   * checkboxes by `[data-ceremony-step="<dataStep>"]` (the new contract —
   * `"disclosure"` or `"adopt"`), falling back to any
   * `input[type="checkbox"]` in the container for environments that don't
   * carry the attribute yet. This is a plain OR (`stepLocator`, same as
   * every other step selector below): once the new attribute is deployed,
   * the fallback half stops matching anything new — it never causes a
   * checkbox to be counted twice, since a comma-separated CSS selector list
   * already de-duplicates elements that match more than one branch.
   */
  async function checkAllCheckboxes(scopeLocator, dataStep) {
    const boxes = stepLocator(scopeLocator, dataStep, 'input[type="checkbox"]');
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      const box = boxes.nth(i);
      if (!(await box.isChecked().catch(() => false))) await box.check({ timeout: 5000 });
    }
    return count;
  }

  // Step 1: disclosure checkbox(es) + "Agree and Continue" — the consent
  // modal. Some ceremonies (already-consented resumes, certain embeds) skip
  // it, so its genuine absence is tolerated; but once found, "Agree and
  // Continue" must be there too. The container selector is
  // `disclosure-modal` — deliberately NOT the same value ("disclosure") as
  // the checkbox(es) inside it, which is exactly the collision that caused
  // SIG-1222's C1 (see probeContainer's doc comment above).
  walkLastStep = "checking for the disclosure/consent modal";
  const consentModal = stepLocator(page, "disclosure-modal", "#concent-modal");
  const consentModalProbe = await probeContainer(consentModal, 8000);
  if (consentModalProbe.outcome === "ambiguous") {
    await browser.close();
    fail("CEREMONY_CONTAINER_AMBIGUOUS", `While checking for the disclosure/consent modal, the container selector matched more than one element (or errored) instead of exactly one: ${consentModalProbe.detail}. Refusing to guess which one is the real modal — an ambiguous match is not the same as "not on this page". Likely cause: this envelope has an initials place (or another place type) alongside or instead of a signature place — the signer UI shares contract attributes between the signature and initials modals, and this walk only ever completes envelopes whose places are signature places.`, [
      "Hand the ceremony link to a human instead (Branch A in references/verification-loop.md) — it works for every place type",
      "Re-run with PWDEBUG=1 to watch the browser",
      'The disclosure-modal contract value may now also be matching something it should not — inspect the page and narrow the selector',
    ]);
  }
  if (consentModalProbe.outcome === "present") {
    await noteFallbackIfUsed(page, "disclosure-modal");
    walkLastStep = "checking the disclosure agreement checkbox(es)";
    await checkAllCheckboxes(consentModal, "disclosure");
    await clickStep({
      step: "clicking Agree and Continue",
      locator: stepLocator(page, "disclosure-continue", "#continue-consent-button"),
      dataStep: "disclosure-continue",
      scope: page,
      name: "Agree and Continue",
      timeout: 10000,
    });
  }
  // consentModalProbe.outcome === "absent": genuinely not on this page —
  // nothing to do, and nothing was reported as satisfied for it (see
  // fallbackStepsUsed / noteFallbackIfUsed above, which was never called in
  // this branch).

  // Step 2: "Start" — begins signing / scrolls to the first place. Some
  // ceremonies open straight into the document with nothing to click here.
  await clickStep({
    step: "clicking Start",
    locator: stepLocator(page, "start", "#primary-button:visible, #primary-button-inline:visible", ":visible").first(),
    dataStep: "start",
    scope: page,
    name: "Start",
    timeout: 8000,
    required: false,
  });

  // Step 3: click the signature box (a "place") to open the adoption modal.
  await clickStep({
    step: "clicking the signature box",
    locator: stepLocator(page, "place", 'button[aria-label="Sign here"]').first(),
    dataStep: "place",
    scope: page,
    name: "signature box",
    timeout: 15000,
  });

  // Step 4: the signature adoption modal — fill the typed signature (usually
  // pre-filled with the recipient's name; fill it explicitly if it isn't),
  // check the adoption agreement checkbox, then "Adopt and Sign". The
  // container selector is `adopt-modal` — deliberately NOT `adopt`, the
  // checkbox value inside it (see the disclosure-modal comment above for
  // why that distinction matters).
  walkLastStep = "waiting for the signature adoption modal";
  const adoptionModal = stepLocator(page, "adopt-modal", "#adoption-modal");
  const adoptionModalProbe = await probeContainer(adoptionModal, 15000);
  if (adoptionModalProbe.outcome === "ambiguous") {
    await browser.close();
    fail("CEREMONY_CONTAINER_AMBIGUOUS", `While waiting for the signature adoption modal, the container selector matched more than one element (or errored) instead of exactly one: ${adoptionModalProbe.detail}. Refusing to guess which one is the real modal. Likely cause: this envelope has an initials place (or another place type) alongside or instead of a signature place — the signer UI shares contract attributes between the signature and initials modals, and this walk only ever completes envelopes whose places are signature places.`, [
      "Hand the ceremony link to a human instead (Branch A in references/verification-loop.md) — it works for every place type",
      "Re-run with PWDEBUG=1 to watch the browser",
      "The adopt-modal contract value may now also be matching something it should not — inspect the page and narrow the selector",
    ]);
  }
  if (adoptionModalProbe.outcome === "absent") {
    await browser.close();
    fail("CEREMONY_WALK_STEP_NOT_FOUND", 'Could not find the signature adoption modal after clicking the signature box.', [
      "Re-run with PWDEBUG=1 to watch the browser",
      "The ceremony UI may differ from the sequence this script expects — inspect and update the selectors",
    ]);
  }
  await noteFallbackIfUsed(page, "adopt-modal");

  walkLastStep = "filling the typed signature";
  const typedInput = stepLocator(adoptionModal, "signature-input", "#typed_symbol");
  if (await typedInput.count()) {
    await noteFallbackIfUsed(adoptionModal, "signature-input");
    const current = await typedInput.inputValue().catch(() => "");
    if (!current.trim()) {
      await typedInput.fill(targetRecipient?.name || "Signature", { timeout: 5000 });
    }
  }

  walkLastStep = "checking the signature adoption agreement checkbox(es)";
  await checkAllCheckboxes(adoptionModal, "adopt");

  await clickStep({
    step: "clicking Adopt and Sign",
    locator: stepLocator(page, "adopt-apply", "#adopt-button"),
    dataStep: "adopt-apply",
    scope: page,
    name: "Adopt and Sign",
    timeout: 10000,
  });

  walkLastStep = "waiting for the adoption modal to close";
  await adoptionModal.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

  // Step 5: "Finish" — submits the ceremony.
  await clickStep({
    step: "clicking Finish",
    locator: stepLocator(page, "finish", "#primary-button:visible, #primary-button-inline:visible", ":visible").first(),
    dataStep: "finish",
    scope: page,
    name: "Finish",
    timeout: 15000,
  });

  // Fallback: if organic input was not detected, a completion consent modal
  // appears instead of submitting directly. Confirming it is itself the
  // deliberate act.
  await clickStep({
    step: "confirming the completion consent fallback modal (if shown)",
    locator: page.locator('[data-testid="completion-consent-confirm"]'),
    name: "confirm",
    timeout: 4000,
    required: false,
  });

  await page.waitForTimeout(2000);
  const finalUrl = page.url();
  await browser.close();

  // --envelope is now mandatory (see the URL_REQUIRES_ENVELOPE check above),
  // so envelopeId is always set here — there is no unverified-walk path left
  // to report through.

  // The walk finishing without a thrown error proves nothing by itself — it
  // is exactly what the original, defective version of this script reported
  // as success on. The only thing that counts is the server's own view of
  // the recipient.
  const completeTimeoutMs = Number(arg("timeout", "120")) * 1000;
  const result = await pollForRecipientCompletion({
    api: API,
    envelopeId,
    recipientKey: targetRecipientKey,
    key,
    timeoutMs: completeTimeoutMs,
  });

  if (result.code === "RECIPIENT_KEY_UNRESOLVED") {
    fail(
      "RECIPIENT_KEY_UNRESOLVED",
      `Could not determine which recipient's ceremony this walk drove (the ceremony_id claim in the URL's token could not be parsed), so completion cannot be verified against the right recipient. On a multi-recipient envelope, checking an arbitrary recipient instead could report "verified: true" for a walk that signed nothing — refusing to guess.`,
      [
        "Pass --recipient <key> explicitly so verification knows who to check",
        `curl -sS -H "X-API-Key: $SIGNATUREAPI_KEY" ${API}/envelopes/${envelopeId}`,
      ],
    );
  }

  if (!result.completed) {
    fail(
      "CEREMONY_WALK_DID_NOT_COMPLETE",
      `The browser walk finished (last step believed performed: "${walkLastStep}") but the recipient never reached "completed". Actual recipient status: ${result.recipient?.status ?? "unknown — envelope was not reachable while polling"}.`,
      [
        `curl -sS -H "X-API-Key: $SIGNATUREAPI_KEY" ${API}/envelopes/${envelopeId}`,
        "Re-run with PWDEBUG=1 to watch the browser and see where the walk actually diverged from the expected sequence",
        "node scripts/watch-events.mjs --envelope " + envelopeId,
      ],
    );
  }

  ok({
    walked: true,
    verified: true,
    envelope_id: envelopeId,
    envelope_status: result.envelope.status,
    recipient_key: targetRecipientKey,
    recipient_status: result.recipient.status,
    final_url: finalUrl,
    // Empty once every environment ships the data-ceremony-step contract —
    // see the fallback comment above clickStep for what to remove then.
    contract_fallback_steps: fallbackStepsUsed,
    next: ["node scripts/watch-events.mjs --envelope " + envelopeId],
  });
}
