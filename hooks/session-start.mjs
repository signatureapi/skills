#!/usr/bin/env node
// SessionStart readiness hook for the SignatureAPI plugin. Checks, without
// any network call, whether the project in the session's working directory
// is ready for the SignatureAPI skills: an API key in SIGNATUREAPI_KEY, no
// live key in a committed env file, a webhook secret next to a webhook ID,
// and a working signatureapi CLI when one is on PATH. It stays silent when
// the project does not use SignatureAPI or nothing needs fixing, never
// prints a variable's value, and always exits 0. `--host` picks the output
// shape: claude, codex or cursor. A missing or unknown host gets the Claude
// Code shape.
import { execFile } from "node:child_process";
import { accessSync, constants, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KEY_VAR = "SIGNATUREAPI_KEY";
export const ALIAS_KEY_VAR = "SIGNATUREAPI_API_KEY";
export const WEBHOOK_ID_VAR = "SIGNATUREAPI_WEBHOOK_ID";
export const WEBHOOK_SECRET_VAR = "SIGNATUREAPI_WEBHOOK_SECRET";
export const TEST_KEY_PREFIX = "key_test_";
export const LIVE_KEY_PREFIX = "key_live_";
export const HOSTS = ["claude", "codex", "cursor"];

const BUDGET_MS = 1800;
const MAX_ENV_FILES = 20;
const MAX_FILE_BYTES = 256 * 1024;
const TEMPLATE_ENV_FILE = /\.(example|sample|template|dist|defaults?)$/i;
const ENV_FILE = /^\.env(\..+)?$/;
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const REAL_LIVE_KEY = /^key_live_[A-Za-z0-9]{8,}$/;

/** Reads a file only when it is a regular file under the size cap. */
function readSmallFile(path) {
  try {
    const info = statSync(path);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function unquote(raw) {
  let value = raw.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  const comment = value.search(/\s#/);
  if (comment !== -1) value = value.slice(0, comment);
  return value.trim();
}

/** Variable name to value for one dotenv file. Values stay in memory only. */
export function parseEnvFile(text) {
  const vars = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(ASSIGNMENT);
    if (match) vars.set(match[1], unquote(match[2]));
  }
  return vars;
}

/** The .env* files directly in the project root. No recursion. */
export function readEnvFiles(projectDir) {
  let names;
  try {
    names = readdirSync(projectDir).filter((name) => ENV_FILE.test(name)).sort().slice(0, MAX_ENV_FILES);
  } catch {
    return [];
  }
  const files = [];
  for (const name of names) {
    const text = readSmallFile(join(projectDir, name));
    if (text !== null) files.push({ name, template: TEMPLATE_ENV_FILE.test(name), vars: parseEnvFile(text) });
  }
  return files;
}

function packageUsesSignatureApi(projectDir) {
  const text = readSmallFile(join(projectDir, "package.json"));
  if (!text) return false;
  try {
    const pkg = JSON.parse(text);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      if (Object.keys(pkg?.[field] ?? {}).some((name) => name.toLowerCase().includes("signatureapi"))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasDesignDocument(projectDir) {
  return readSmallFile(join(projectDir, "docs", "signatureapi-integration.md")) !== null;
}

/** True when the project in projectDir uses SignatureAPI. Cheap checks only. */
export function isRelevant({ projectDir, env, envFiles }) {
  if (env[KEY_VAR] || env[ALIAS_KEY_VAR]) return true;
  if (envFiles.some((file) => [...file.vars.keys()].some((name) => name.startsWith("SIGNATUREAPI_")))) return true;
  return packageUsesSignatureApi(projectDir) || hasDesignDocument(projectDir);
}

/** Absolute path of an executable on PATH, or null. Never runs it. */
export function findExecutable(name, env = process.env, platform = process.platform) {
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  const extensions = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = join(dir, name + extension.toLowerCase());
      try {
        if (!statSync(candidate).isFile()) continue;
        if (platform !== "win32") accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not here; keep looking
      }
    }
  }
  return null;
}

/** Runs a command with a timeout. Resolves { code, stdout, timedOut }; never rejects. */
export function execWithTimeout(command, args, { cwd, timeout }) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { cwd, timeout, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout) => {
        if (!error) return resolve({ code: 0, stdout: String(stdout), timedOut: false });
        const timedOut = Boolean(error.killed) || error.signal === "SIGTERM";
        resolve({ code: typeof error.code === "number" ? error.code : 1, stdout: String(stdout ?? ""), timedOut });
      });
    } catch {
      resolve({ code: 1, stdout: "", timedOut: false });
    }
  });
}

function hasValue(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The readiness findings for a project, as short imperative lines. Empty
 * when the project does not use SignatureAPI or everything is in place.
 * Every line names variables and files only, never a value.
 */
export async function evaluate({
  projectDir,
  env = {},
  platform = process.platform,
  locate = findExecutable,
  exec = execWithTimeout,
  now = Date.now,
}) {
  const started = now();
  const remaining = () => Math.max(0, BUDGET_MS - (now() - started));
  const envFiles = readEnvFiles(projectDir);
  if (!isRelevant({ projectDir, env, envFiles })) return [];

  const findings = [];
  const cliPath = locate("signatureapi", env, platform);
  const cli = cliPath ? "signatureapi" : "npx --yes signatureapi";

  if (cliPath && platform !== "win32" && remaining() > 200) {
    const result = await exec(cliPath, ["--version"], { cwd: projectDir, timeout: Math.min(1000, remaining()) });
    if (!result.timedOut && result.code !== 0) {
      findings.push(
        "The signatureapi CLI on PATH does not run. Reinstall it with `npm install -g signatureapi`, or use `npx --yes signatureapi` instead.",
      );
    }
  }

  const realFiles = envFiles.filter((file) => !file.template);
  const keyFiles = realFiles.filter((file) => hasValue(file.vars.get(KEY_VAR))).map((file) => file.name);
  const keyInEnv = hasValue(env[KEY_VAR]);
  const aliasOnly =
    !keyInEnv &&
    keyFiles.length === 0 &&
    (hasValue(env[ALIAS_KEY_VAR]) || realFiles.some((file) => hasValue(file.vars.get(ALIAS_KEY_VAR))));

  if (aliasOnly) {
    findings.push(
      `${ALIAS_KEY_VAR} is set, but the skills and the CLI read ${KEY_VAR}. Rename the variable to ${KEY_VAR}.`,
    );
  } else if (!keyInEnv && keyFiles.length === 0) {
    findings.push(
      `No ${KEY_VAR} is set in this session or in the project's .env files. Ask the user to run \`${cli} init\` in the project directory. It saves the account's test key after a browser sign-in.`,
    );
  } else if (!keyInEnv) {
    findings.push(
      `${KEY_VAR} is in ${keyFiles.join(", ")} but not in this session's environment. Load it before running a skill script, for example with \`node --env-file=${keyFiles[0]}\`.`,
    );
  } else if (!env[KEY_VAR].trim().startsWith(TEST_KEY_PREFIX)) {
    findings.push(
      `${KEY_VAR} in this session is not a test key (${TEST_KEY_PREFIX}). The integrate skill refuses it. Use the test key for development.`,
    );
  }

  const liveKeyFiles = envFiles.filter((file) =>
    [...file.vars.values()].some((value) => REAL_LIVE_KEY.test(value.trim())),
  );
  if (liveKeyFiles.length > 0) {
    let tracked = new Set();
    if (remaining() > 200) {
      const result = await exec("git", ["ls-files", "--", ...liveKeyFiles.map((file) => file.name)], {
        cwd: projectDir,
        timeout: Math.min(1000, remaining()),
      });
      if (result.code === 0) tracked = new Set(result.stdout.split(/\r?\n/).filter(Boolean));
    }
    const committed = liveKeyFiles.filter((file) => file.template || tracked.has(file.name)).map((file) => file.name);
    if (committed.length > 0) {
      findings.push(
        `A live key (${LIVE_KEY_PREFIX}) is in ${committed.join(", ")}, which is committed or meant to be. Tell the user to roll or revoke that key, and keep live keys only in an env file Git ignores.`,
      );
    }
  }

  const has = (name) => hasValue(env[name]) || realFiles.some((file) => hasValue(file.vars.get(name)));
  if (has(WEBHOOK_ID_VAR) && !has(WEBHOOK_SECRET_VAR)) {
    findings.push(
      `${WEBHOOK_ID_VAR} is set but ${WEBHOOK_SECRET_VAR} is not. Run \`${cli} listen --forward-to <your webhook URL>\` to save the secret.`,
    );
  }

  return findings;
}

/** The context text the host shows the agent, or "" when there is nothing to say. */
export function formatMessage(findings) {
  if (findings.length === 0) return "";
  return ["SignatureAPI setup check for this project:", ...findings.map((line) => `- ${line}`)].join("\n");
}

export function resolveHost(value) {
  return HOSTS.includes(value) ? value : "claude";
}

/** The exact stdout for one host. Cursor has its own field; Claude Code and Codex share one shape. */
export function render(host, message) {
  if (!message) return "";
  if (host === "cursor") return `${JSON.stringify({ additional_context: message })}\n`;
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message } })}\n`;
}

/** Picks the project directory from the host's stdin payload, then its environment. */
export function projectDirFrom(input, env, fallback) {
  if (typeof input?.cwd === "string" && input.cwd) return input.cwd;
  if (Array.isArray(input?.workspace_roots) && typeof input.workspace_roots[0] === "string") return input.workspace_roots[0];
  return env.CLAUDE_PROJECT_DIR || env.CURSOR_PROJECT_DIR || fallback;
}

export function parseHostArg(argv) {
  const index = argv.indexOf("--host");
  if (index !== -1) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith("--host="));
  return inline ? inline.slice("--host=".length) : "claude";
}

/** The whole hook as a function: returns the stdout text. Never throws. */
export async function runHook({ argv = [], env = {}, stdinText = "", cwd = process.cwd(), ...deps } = {}) {
  try {
    let input = null;
    try {
      input = stdinText.trim() ? JSON.parse(stdinText) : null;
    } catch {
      input = null;
    }
    const host = resolveHost(parseHostArg(argv));
    const projectDir = projectDirFrom(input, env, cwd);
    const findings = await evaluate({ projectDir, env, ...deps });
    return render(host, formatMessage(findings));
  } catch {
    return "";
  }
}

function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    const finish = () => {
      clearTimeout(timer);
      process.stdin.removeAllListeners();
      process.stdin.pause();
      process.stdin.unref?.();
      resolve(data);
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
        if (data.length > MAX_FILE_BYTES) finish();
      });
      process.stdin.on("end", finish);
      process.stdin.on("error", finish);
    } catch {
      finish();
    }
  });
}

async function main() {
  const stop = () => process.exit(0);
  process.on("uncaughtException", stop);
  process.on("unhandledRejection", stop);
  setTimeout(stop, 2500).unref();
  const stdinText = await readStdin(300);
  const output = await runHook({ argv: process.argv.slice(2), env: process.env, stdinText });
  if (output) process.stdout.write(output, stop);
  else stop();
}

let isMain = false;
try {
  isMain = realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
} catch {
  isMain = false;
}
if (isMain) main().catch(() => process.exit(0));
