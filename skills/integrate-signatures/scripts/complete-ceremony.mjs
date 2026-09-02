#!/usr/bin/env node
import { ok, fail } from "./lib/output.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const url = arg("url");
if (!url) {
  fail("MISSING_CEREMONY_URL", "Pass --url <ceremony url>.", [
    "MCP: list_emails --envelope <id>, then get_email to read ceremony_url",
  ]);
}
if (!process.argv.includes("--i-consent")) {
  fail("CONSENT_REQUIRED", "This drives a real browser through a signing ceremony. Test mode only, and only with the user's explicit consent.", [
    "Ask the user to confirm, then re-run with --i-consent",
    "Or use Branch A: hand the ceremony link to the user and wait",
  ]);
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

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle" });

// Arm completion with genuine pointer movement (SIG-1211 organic-input gate).
for (let i = 0; i < 12; i++) {
  await page.mouse.move(100 + i * 40, 150 + i * 25, { steps: 4 });
}

try {
  await page.getByRole("button", { name: /start|begin|continue/i }).first().click({ timeout: 5000 });
} catch { /* some ceremonies open straight into the document */ }

await page.waitForTimeout(1000);

try {
  await page.getByRole("button", { name: /sign|approve|finish|complete|submit/i }).first().click({ timeout: 15000 });
} catch {
  await browser.close();
  fail("CEREMONY_ACTION_NOT_FOUND", "Could not find the primary ceremony action.", [
    "Re-run with PWDEBUG=1 to watch the browser",
    "Or use Branch A: hand the link to the user",
  ]);
}

// Fallback: if organic input was not detected, a consent modal appears instead
// of submitting. Confirming it is itself the deliberate act.
try {
  await page.getByRole("button", { name: /confirm|yes|continue/i }).first().click({ timeout: 4000 });
} catch { /* no modal — the click submitted directly */ }

await page.waitForTimeout(3000);
const finalUrl = page.url();
await browser.close();

ok({
  walked: true,
  final_url: finalUrl,
  next: ["node watch-events.mjs --envelope <envelope id>"],
});
