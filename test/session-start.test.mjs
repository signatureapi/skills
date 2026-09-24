import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { HOSTS, runHook, evaluate, parseEnvFile } from "../hooks/session-start.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("../hooks/session-start.mjs", import.meta.url));
const TEST_KEY = "key_test_FIXTURECANARYtest0000000000";
const LIVE_KEY = "key_live_FIXTURECANARYlive0000000000";
const WEBHOOK_SECRET = "whsec_FIXTURECANARYsecret000000";

/** A throwaway project directory holding the given files. */
async function project(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), "signatureapi-hook-"));
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    await mkdir(path.replace(/\/[^/]+$/, ""), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

/** Injected CLI lookup and subprocess runner, so no test depends on the machine's PATH or Git. */
function fakes({ cli = false, versionCode = 0, tracked = [] } = {}) {
  const calls = [];
  return {
    calls,
    platform: "linux",
    locate: () => (cli ? "/fake/bin/signatureapi" : null),
    exec: async (command, args) => {
      calls.push([command, ...args]);
      if (command === "git") return { code: 0, stdout: tracked.map((name) => `${name}\n`).join(""), timedOut: false };
      return { code: versionCode, stdout: "", timedOut: false };
    },
  };
}

function contextOf(host, output) {
  const parsed = JSON.parse(output);
  if (host === "cursor") return parsed.additional_context;
  return parsed.hookSpecificOutput.additionalContext;
}

test("stays silent for a project that does not use SignatureAPI, on every host", async () => {
  const dir = await project({ ".env": "DATABASE_URL=postgres://localhost/app\n", "package.json": '{"dependencies":{"express":"5.0.0"}}' });
  for (const host of HOSTS) {
    const output = await runHook({ argv: ["--host", host], env: {}, cwd: dir, ...fakes() });
    assert.equal(output, "", `${host} printed output for an unrelated project`);
  }
});

test("each relevance signal on its own makes the hook speak", async () => {
  const cases = [
    { name: "SIGNATUREAPI_ name in an env file", files: { ".env.example": "SIGNATUREAPI_KEY=\n" }, env: {} },
    { name: "package.json dependency", files: { "package.json": '{"dependencies":{"@signatureapi/sdk":"1.0.0"}}' }, env: {} },
    { name: "design document", files: { "docs/signatureapi-integration.md": "# Design\n" }, env: {} },
    { name: "alias key in the session", files: {}, env: { SIGNATUREAPI_API_KEY: TEST_KEY } },
  ];
  for (const { name, files, env } of cases) {
    const dir = await project(files);
    const output = await runHook({ argv: ["--host", "claude"], env, cwd: dir, ...fakes() });
    assert.notEqual(output, "", `${name} did not count as relevant`);
  }
});

test("stays silent when a relevant project is ready", async () => {
  const dir = await project({ ".env": `SIGNATUREAPI_KEY=${TEST_KEY}\nSIGNATUREAPI_WEBHOOK_ID=cli_x\nSIGNATUREAPI_WEBHOOK_SECRET=${WEBHOOK_SECRET}\n` });
  const env = { SIGNATUREAPI_KEY: TEST_KEY };
  for (const host of HOSTS) {
    const output = await runHook({ argv: ["--host", host], env, cwd: dir, ...fakes({ cli: true }) });
    assert.equal(output, "", `${host} spoke for a ready project`);
  }
});

test("each host gets its own output shape", async () => {
  const dir = await project({ ".env.example": "SIGNATUREAPI_KEY=\n" });
  for (const host of HOSTS) {
    const output = await runHook({ argv: ["--host", host], env: {}, cwd: dir, ...fakes() });
    assert.ok(output.endsWith("\n"));
    const parsed = JSON.parse(output);
    if (host === "cursor") {
      assert.deepEqual(Object.keys(parsed), ["additional_context"]);
      assert.match(parsed.additional_context, /SIGNATUREAPI_KEY/);
    } else {
      assert.deepEqual(Object.keys(parsed), ["hookSpecificOutput"]);
      assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
      assert.match(parsed.hookSpecificOutput.additionalContext, /SIGNATUREAPI_KEY/);
    }
  }
});

test("a missing or unknown host gets the Claude Code shape", async () => {
  const dir = await project({ ".env.example": "SIGNATUREAPI_KEY=\n" });
  for (const argv of [[], ["--host"], ["--host", "gemini"], ["--host=unknown"]]) {
    const parsed = JSON.parse(await runHook({ argv, env: {}, cwd: dir, ...fakes() }));
    assert.deepEqual(Object.keys(parsed), ["hookSpecificOutput"]);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  }
});

test("the project directory comes from the host's stdin payload before the process cwd", async () => {
  const relevant = await project({ ".env.example": "SIGNATUREAPI_KEY=\n" });
  const unrelated = await project();
  const payloads = [JSON.stringify({ cwd: relevant }), JSON.stringify({ workspace_roots: [relevant] })];
  for (const stdinText of payloads) {
    const output = await runHook({ argv: ["--host", "claude"], env: {}, cwd: unrelated, stdinText, ...fakes() });
    assert.notEqual(output, "", `payload ${stdinText} was not used`);
  }
});

test("never prints a key or secret value", async () => {
  const dir = await project({
    ".env": `SIGNATUREAPI_KEY=${LIVE_KEY}\nSIGNATUREAPI_WEBHOOK_ID=cli_x\n`,
    ".env.example": `SIGNATUREAPI_KEY=${LIVE_KEY}\nSIGNATUREAPI_WEBHOOK_SECRET=${WEBHOOK_SECRET}\n`,
  });
  const envs = [{}, { SIGNATUREAPI_KEY: LIVE_KEY }, { SIGNATUREAPI_API_KEY: LIVE_KEY }, { SIGNATUREAPI_KEY: TEST_KEY }];
  for (const env of envs) {
    for (const host of HOSTS) {
      const output = await runHook({ argv: ["--host", host], env, cwd: dir, ...fakes({ tracked: [".env"] }) });
      assert.notEqual(output, "");
      assert.doesNotMatch(output, /FIXTURECANARY/, `${host} leaked a value`);
    }
  }
});

test("flags a live key in a committed or template env file, and only there", async () => {
  const cases = [
    { files: { ".env.example": `SIGNATUREAPI_KEY=${LIVE_KEY}\n` }, tracked: [], flagged: ".env.example" },
    { files: { ".env": `SIGNATUREAPI_KEY=${LIVE_KEY}\n` }, tracked: [".env"], flagged: ".env" },
    { files: { ".env": `SIGNATUREAPI_KEY=${LIVE_KEY}\n` }, tracked: [], flagged: null },
    { files: { ".env.example": "SIGNATUREAPI_KEY=key_live_...\n" }, tracked: [], flagged: null },
  ];
  for (const { files, tracked, flagged } of cases) {
    const dir = await project(files);
    const findings = await evaluate({ projectDir: dir, env: { SIGNATUREAPI_KEY: TEST_KEY }, ...fakes({ tracked }) });
    const live = findings.find((line) => line.includes("live key (key_live_)"));
    if (flagged) assert.ok(live?.includes(flagged), `expected a live-key finding for ${flagged}`);
    else assert.equal(live, undefined, `unexpected live-key finding: ${live}`);
  }
});

test("runs Git only when an env file holds a live-shaped key", async () => {
  const dir = await project({ ".env": `SIGNATUREAPI_KEY=${TEST_KEY}\n` });
  const deps = fakes();
  await evaluate({ projectDir: dir, env: {}, ...deps });
  assert.ok(!deps.calls.some(([command]) => command === "git"));
});

test("advises npx when the CLI is absent and the installed command when it is present", async () => {
  const dir = await project({ ".env.example": "SIGNATUREAPI_KEY=\n" });
  const absent = await evaluate({ projectDir: dir, env: {}, ...fakes({ cli: false }) });
  assert.ok(absent.some((line) => line.includes("`npx --yes signatureapi init`")));

  const present = fakes({ cli: true });
  const findings = await evaluate({ projectDir: dir, env: {}, ...present });
  assert.ok(findings.some((line) => line.includes("`signatureapi init`") && !line.includes("npx")));
  assert.deepEqual(present.calls[0], ["/fake/bin/signatureapi", "--version"]);
});

test("reports a CLI on PATH that fails to run, but not one that is only slow", async () => {
  const dir = await project({ ".env.example": "SIGNATUREAPI_KEY=\n" });
  const broken = await evaluate({ projectDir: dir, env: {}, ...fakes({ cli: true, versionCode: 127 }) });
  assert.ok(broken.some((line) => line.includes("does not run")));

  const slow = {
    ...fakes({ cli: true }),
    exec: async () => ({ code: 1, stdout: "", timedOut: true }),
  };
  const findings = await evaluate({ projectDir: dir, env: {}, ...slow });
  assert.ok(!findings.some((line) => line.includes("does not run")));
});

test("reports each key and webhook gap with the variable to fix", async () => {
  const cases = [
    { files: { ".env.example": "SIGNATUREAPI_KEY=\n" }, env: {}, expect: /No SIGNATUREAPI_KEY is set/ },
    { files: { ".env": `SIGNATUREAPI_KEY=${TEST_KEY}\n` }, env: {}, expect: /in \.env but not in this session's environment/ },
    { files: {}, env: { SIGNATUREAPI_API_KEY: TEST_KEY }, expect: /Rename the variable to SIGNATUREAPI_KEY/ },
    { files: {}, env: { SIGNATUREAPI_KEY: LIVE_KEY }, expect: /is not a test key/ },
    {
      files: { ".env": "SIGNATUREAPI_WEBHOOK_ID=cli_x\n" },
      env: { SIGNATUREAPI_KEY: TEST_KEY },
      expect: /SIGNATUREAPI_WEBHOOK_SECRET is not/,
    },
  ];
  for (const { files, env, expect } of cases) {
    const dir = await project(files);
    const findings = await evaluate({ projectDir: dir, env, ...fakes() });
    assert.ok(findings.some((line) => expect.test(line)), `no finding matched ${expect}: ${JSON.stringify(findings)}`);
  }
});

test("parseEnvFile reads export, quotes and trailing comments", () => {
  const vars = parseEnvFile(['export A="x y"', "B='z' # note", "C=w # note", "# D=skip", "E="].join("\n"));
  assert.equal(vars.get("A"), "x y");
  assert.equal(vars.get("B"), "z");
  assert.equal(vars.get("C"), "w");
  assert.equal(vars.has("D"), false);
  assert.equal(vars.get("E"), "");
});

test("the script always exits 0, whatever its input", async () => {
  const relevant = await project({ ".env.example": "SIGNATUREAPI_KEY=\n" });
  const runs = [
    { argv: ["--host", "claude"], cwd: relevant, stdin: "not json" },
    { argv: ["--host", "cursor"], cwd: relevant, stdin: JSON.stringify({ workspace_roots: ["/does/not/exist"] }) },
    { argv: ["--host"], cwd: relevant, stdin: "" },
    { argv: ["--host", "codex"], cwd: relevant, stdin: JSON.stringify({ cwd: 42 }) },
  ];
  for (const { argv, cwd, stdin } of runs) {
    const child = execFileAsync(process.execPath, [SCRIPT, ...argv], {
      cwd,
      env: { PATH: "" },
      timeout: 5000,
    });
    child.child.stdin.end(stdin);
    const { stdout } = await child;
    if (stdout) JSON.parse(stdout);
  }
});
