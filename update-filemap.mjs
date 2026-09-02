#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function buildFilemap(entries) {
  const lines = ["# FILEMAP", "", "Every file in this repo and what it is for.", ""];
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`- \`${entry.path}\` — ${entry.description}`);
  }
  return `${lines.join("\n")}\n`;
}

async function walk(dir, acc = []) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name.startsWith(".")) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

async function describe(file) {
  if (file.endsWith("SKILL.md")) {
    const text = await readFile(file, "utf8");
    const match = text.match(/^description:\s*"?(.+?)"?$/m);
    return match ? match[1] : "Skill entrypoint";
  }
  const text = await readFile(file, "utf8").catch(() => "");
  const first = text.split("\n").find((l) => l.startsWith("// ") || l.startsWith("# "));
  return first ? first.replace(/^(\/\/|#)\s*/, "") : path.extname(file).replace(".", "") || "file";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await walk("skills");
  const entries = await Promise.all(files.map(async (f) => ({ path: f, description: await describe(f) })));
  await writeFile("FILEMAP.md", buildFilemap(entries));
  console.log(`Wrote FILEMAP.md with ${entries.length} entries.`);
}
