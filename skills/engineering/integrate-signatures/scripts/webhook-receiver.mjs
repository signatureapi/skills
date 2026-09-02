#!/usr/bin/env node
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4000);
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
}).listen(port, () => {
  console.log(JSON.stringify({
    ok: true,
    listening: `http://localhost:${port}`,
    next: [
      "Expose this with a tunnel (e.g. `npx untun@latest tunnel http://localhost:4000`)",
      "Register the public URL as a test-mode webhook endpoint in the dashboard",
    ],
  }, null, 2));
});
