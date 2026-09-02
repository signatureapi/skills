#!/usr/bin/env node
import { copyFile, mkdir } from "node:fs/promises";

const targets = [
  "skills/integrate-signatures/scripts/lib/output.mjs",
  "skills/troubleshoot-signatures/scripts/lib/output.mjs",
];

for (const target of targets) {
  await mkdir(target.replace(/\/[^/]+$/, ""), { recursive: true });
  await copyFile("lib/output.mjs", target);
  console.log(`synced ${target}`);
}
