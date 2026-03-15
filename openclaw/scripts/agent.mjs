#!/usr/bin/env node
/**
 * Run402 agent — manage agent identity.
 *
 * Usage:
 *   node agent.mjs contact --name <name> [--email <email>] [--webhook <url>]
 */

import { walletAuthHeaders, API } from "./config.mjs";

async function contact(extraArgs) {
  let name = null, email = null, webhook = null;
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "--name" && extraArgs[i + 1]) name = extraArgs[++i];
    if (extraArgs[i] === "--email" && extraArgs[i + 1]) email = extraArgs[++i];
    if (extraArgs[i] === "--webhook" && extraArgs[i + 1]) webhook = extraArgs[++i];
  }
  if (!name) { console.error(JSON.stringify({ status: "error", message: "Missing --name <name>" })); process.exit(1); }
  const authHeaders = await walletAuthHeaders();

  const body = { name };
  if (email) body.email = email;
  if (webhook) body.webhook = webhook;

  const res = await fetch(`${API}/agent/v1/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "contact": await contact(args); break;
  default:
    console.log("Usage: node agent.mjs contact --name <name> [--email <email>] [--webhook <url>]");
    process.exit(1);
}
