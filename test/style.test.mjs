import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// STYLE.md, rules 1 and 3, as far as a script can check them: no sentence
// over 30 words outside code and tables, and none of the banned words.
// Sentences split on ". ", "? " and "! " after the wrapped lines of one
// block are joined. A block starts at a blank line, a heading, a list
// marker, a blockquote or a table row. Fenced code, indented code and table
// rows are skipped. "surface" is not checked: the verb is hard to tell from
// the noun.
const MAX_WORDS = 30;
const BANNED = ["leverage", "orchestrate", "seamless", "robust", "utilize", "in order to"];

async function skillMarkdownFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "skills"]);
  const files = stdout.split("\n").filter((f) => f.endsWith(".md") && !f.includes("/node_modules/"));
  assert.ok(files.length >= 3, `expected the skill markdown files, found ${files.length}`);
  return files;
}

const BLOCK_START = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s?|---)/;
const MARKER = /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?)/;
const INDENTED_CODE = /^ {4,}\S/;

/** Prose blocks of a markdown file: fenced code, indented code and table rows removed. */
export function proseBlocks(markdown) {
  const blocks = [];
  let current = [];
  let inFence = false;
  let inIndentedCode = false;
  const flush = () => {
    if (current.length) blocks.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
    inIndentedCode = false;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      continue;
    }
    if (BLOCK_START.test(line)) flush();
    if (current.length === 0 && INDENTED_CODE.test(line)) inIndentedCode = true;
    if (inIndentedCode) continue;
    current.push(line.replace(MARKER, "").trim());
  }
  flush();
  return blocks.filter(Boolean);
}

export function sentences(block) {
  return block
    .replace(/`[^`]*`/g, "code")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function wordCount(sentence) {
  return sentence.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

test(`no sentence in skills/**/*.md is over ${MAX_WORDS} words, outside code and tables`, async () => {
  const problems = [];
  for (const file of await skillMarkdownFiles()) {
    for (const block of proseBlocks(await readFile(file, "utf8"))) {
      for (const s of sentences(block)) {
        const n = wordCount(s);
        if (n > MAX_WORDS) problems.push(`${file}: ${n} words: "${s.slice(0, 100)}"`);
      }
    }
  }
  assert.deepEqual(problems, [], `sentences over ${MAX_WORDS} words:\n${problems.join("\n")}`);
});

test("skills/**/*.md use none of the banned words", async () => {
  const problems = [];
  const patterns = BANNED.map((w) => [w, new RegExp(`\\b${w.replace(/ /g, "\\s+")}\\b`, "i")]);
  for (const file of await skillMarkdownFiles()) {
    const prose = proseBlocks(await readFile(file, "utf8")).join("\n");
    for (const [word, re] of patterns) if (re.test(prose)) problems.push(`${file}: "${word}"`);
  }
  assert.deepEqual(problems, [], `banned words found:\n${problems.join("\n")}`);
});

test("proseBlocks skips fenced code, indented code and table rows, and joins wrapped lines", () => {
  const md = [
    "# Title",
    "",
    "First line of a paragraph",
    "wraps here. Second sentence.",
    "",
    "    node scripts/x.mjs some very long command line that is code",
    "",
    "| a | b |",
    "| --- | --- |",
    "",
    "```",
    "code fence line",
    "```",
    "- item one",
    "  continues here.",
    "- item two",
  ].join("\n");
  assert.deepEqual(proseBlocks(md), ["Title", "First line of a paragraph wraps here. Second sentence.", "item one continues here.", "item two"]);
  assert.deepEqual(sentences("First line wraps here. Second sentence."), ["First line wraps here.", "Second sentence."]);
  assert.equal(wordCount("Run `node x.mjs` now — then stop."), 6);
});
