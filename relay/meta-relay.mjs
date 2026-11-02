#!/usr/bin/env node
// Model relay for the hosted copy of WireProof.
//
// Meta's Model API decides availability by where a call comes from: a key that works from a laptop in Nigeria gets an
// empty model list from US, EU and Singapore cloud hosts (see README, "Hosting"). So the hosted site sends its model
// calls here, to a machine where the key works. This script:
//   1. listens on localhost and forwards /v1/* to https://api.meta.ai/v1/* with the real key (the key never leaves
//      this machine; the hosted site sends a shared relay token instead);
//   2. opens a Cloudflare quick tunnel so the hosted site can reach it over HTTPS;
//   3. checks in with the hosted site every minute, so it always knows the tunnel's current address.
//
//   node relay/meta-relay.mjs https://wireproof-production.up.railway.app
//
// Reads MODEL_API_KEY and META_RELAY_TOKEN from the environment or web/.env.local. Stop it with Ctrl-C.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(HOST)) {
  console.error("usage: node relay/meta-relay.mjs https://<hosted site>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(path.join(here, "..", "web", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // no .env.local; rely on the environment
}
const KEY = process.env.MODEL_API_KEY;
const TOKEN = process.env.META_RELAY_TOKEN;
if (!KEY || !TOKEN) {
  console.error("MODEL_API_KEY and META_RELAY_TOKEN are needed (environment or web/.env.local)");
  process.exit(2);
}

const PORT = Number(process.env.RELAY_PORT) || 8787;
const META = "https://api.meta.ai";
let calls = 0;

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  if (req.url === "/healthz") return res.writeHead(200).end("ok");
  if (req.headers["x-relay-token"] !== TOKEN) return res.writeHead(401).end("bad relay token");
  if (!req.url?.startsWith("/v1/")) return res.writeHead(404).end("not found");
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { Authorization: `Bearer ${KEY}` };
    if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
    const up = await fetch(`${META}${req.url}`, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(300_000),
    });
    calls += 1;
    res.writeHead(up.status, { "content-type": up.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
    if (up.body) for await (const c of up.body) res.write(c);
    res.end();
    console.log(`${new Date().toISOString()} ${req.method} ${req.url.slice(0, 40)} -> ${up.status} in ${Date.now() - started} ms (${calls} calls this session)`);
  } catch (e) {
    console.error(`${new Date().toISOString()} ${req.method} ${req.url} failed: ${e.message}`);
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "relay_upstream", message: `Relay could not reach Meta's API: ${e.message}` } }));
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`relay listening on http://127.0.0.1:${PORT}`));

// --- Cloudflare quick tunnel: prints its https://*.trycloudflare.com address on stderr. A quick tunnel can die
// silently while cloudflared keeps running, so before every check-in the relay fetches its own public address and
// starts a fresh tunnel (new address) if that fails. ---
let tunnel = null;
let cf = null;
function startTunnel() {
  tunnel = null;
  cf = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
  const proc = cf;
  proc.on("exit", (code) => {
    if (proc !== cf) return; // replaced on purpose
    console.error(`cloudflared exited (${code}); starting a new tunnel in 5 s`);
    setTimeout(startTunnel, 5000);
  });
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on("data", (d) => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && m[0] !== tunnel && proc === cf) {
        tunnel = m[0]; tunnelSince = Date.now(); failures = 0;
        console.log(`${new Date().toISOString()} tunnel up at ${tunnel}`);
        setTimeout(checkIn, 15_000);
      }
    });
  }
}
startTunnel();

async function tunnelAlive() {
  if (!tunnel) return false;
  try {
    const r = await fetch(`${tunnel}/healthz`, { signal: AbortSignal.timeout(10_000) });
    return r.ok;
  } catch {
    return false;
  }
}

let tunnelSince = 0;
let failures = 0;
async function checkIn() {
  if (!tunnel) return;
  // A new quick tunnel takes up to a minute to become reachable: give it that, then three strikes before replacing it.
  if (!(await tunnelAlive())) {
    const age = Date.now() - tunnelSince;
    failures += 1;
    if (age < 90_000) { console.log(`${new Date().toISOString()} tunnel not reachable yet (${Math.round(age / 1000)} s old); waiting`); failures = 0; return; }
    console.error(`${new Date().toISOString()} tunnel ${tunnel} not answering (${failures}/3)`);
    if (failures >= 3) { const old = cf; startTunnel(); old?.kill(); }
    return;
  }
  failures = 0;
  try {
    const r = await fetch(`${HOST}/api/relay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-relay-token": TOKEN },
      body: JSON.stringify({ base: tunnel }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.error(`check-in rejected by ${HOST}: ${r.status} ${await r.text()}`);
    else console.log(`${new Date().toISOString()} checked in with ${HOST}`);
  } catch (e) {
    console.error(`check-in failed: ${e.message}`);
  }
}
setInterval(checkIn, 30_000);

process.on("SIGINT", () => {
  cf?.kill();
  process.exit(0);
});
