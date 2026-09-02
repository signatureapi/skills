#!/usr/bin/env node
import { createServer } from "node:http";

function arg(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

/**
 * Bound to localhost by default: calling .listen(port) with no host binds
 * 0.0.0.0, which is reachable from the LAN. This receiver has no auth of its
 * own, so a LAN-reachable default would let anyone on the network see (and
 * forge) incoming webhook bodies. --host is the explicit opt-in to anything
 * broader.
 */
export function resolveHost(argv) {
  return arg(argv, "host", "127.0.0.1");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  const host = resolveHost(process.argv);
  const received = [];

  createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* keep the raw body */ }
      const entry = { at: new Date().toISOString(), type: parsed?.type ?? "unparsed", body: parsed ?? body };
      received.push(entry);
      console.log(JSON.stringify(entry, null, 2));
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    });
  }).listen(port, host, () => {
    console.log(JSON.stringify({
      ok: true,
      listening: `http://${host}:${port}`,
      next: [
        "Expose this with a tunnel (e.g. `npx untun@latest tunnel http://localhost:4000`)",
        "Register the public URL as a test-mode webhook endpoint in the dashboard",
        "To bind somewhere other than localhost, pass --host <address> explicitly",
      ],
    }, null, 2));
  });
}
