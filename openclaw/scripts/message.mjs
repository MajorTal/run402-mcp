#!/usr/bin/env node
/**
 * Run402 message — send messages to Run402 developers.
 *
 * Usage:
 *   node message.mjs send <text>
 */

import { walletAuthHeaders, API } from "./config.mjs";

async function send(text) {
  if (!text) { console.error(JSON.stringify({ status: "error", message: "Missing message text" })); process.exit(1); }
  const authHeaders = await walletAuthHeaders();

  const res = await fetch(`${API}/message/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ message: text }),
  });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "send": await send(args.join(" ")); break;
  default:
    console.log("Usage: node message.mjs send <text>");
    process.exit(1);
}
