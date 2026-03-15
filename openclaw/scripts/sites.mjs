#!/usr/bin/env node
/**
 * Run402 sites — deploy static sites.
 *
 * Usage:
 *   node sites.mjs deploy --name <name> --manifest <file> [--project <id>] [--target <target>]
 *   cat manifest.json | node sites.mjs deploy --name <name>
 */

import { readFileSync } from "fs";
import { walletAuthHeaders, API } from "./config.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function deploy(extraArgs) {
  const opts = { name: null, manifest: null, project: undefined, target: undefined };
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "--name" && extraArgs[i + 1]) opts.name = extraArgs[++i];
    if (extraArgs[i] === "--manifest" && extraArgs[i + 1]) opts.manifest = extraArgs[++i];
    if (extraArgs[i] === "--project" && extraArgs[i + 1]) opts.project = extraArgs[++i];
    if (extraArgs[i] === "--target" && extraArgs[i + 1]) opts.target = extraArgs[++i];
  }
  if (!opts.name) { console.error(JSON.stringify({ status: "error", message: "Missing --name <name>" })); process.exit(1); }
  const authHeaders = await walletAuthHeaders();

  const manifest = opts.manifest ? JSON.parse(readFileSync(opts.manifest, "utf-8")) : JSON.parse(await readStdin());
  const body = { name: opts.name, files: manifest.files };
  if (opts.project) body.project = opts.project;
  if (opts.target) body.target = opts.target;

  const res = await fetch(`${API}/deployments/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

async function status(deploymentId) {
  if (!deploymentId) { console.error(JSON.stringify({ status: "error", message: "Missing deployment ID" })); process.exit(1); }
  const res = await fetch(`${API}/deployments/v1/${deploymentId}`);
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "deploy": await deploy(args); break;
  case "status": await status(args[0]); break;
  default:
    console.log("Usage: node sites.mjs <deploy|status> [args...]");
    process.exit(1);
}
