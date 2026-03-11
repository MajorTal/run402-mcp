#!/usr/bin/env node
/**
 * Run402 deploy — bundle deploy a full-stack app.
 *
 * Reads wallet from ~/.config/run402/wallet.json.
 * Saves project credentials to ~/.config/run402/projects.json.
 *
 * Usage:
 *   node deploy.mjs --tier prototype --manifest manifest.json
 *   echo '{"name":"app","site":[...]}' | node deploy.mjs --tier prototype
 *
 * Manifest JSON fields (passed to POST /v1/deploy/:tier):
 *   name, migrations, rls, secrets, functions, site, subdomain
 *
 * Waits up to 15s after faucet for funds to settle (only on first deploy).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = process.env.RUN402_CONFIG_DIR || join(homedir(), ".config", "run402");
const WALLET_FILE = join(CONFIG_DIR, "wallet.json");
const PROJECTS_FILE = join(CONFIG_DIR, "projects.json");
const API = process.env.RUN402_API_BASE || "https://api.run402.com";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { tier: "prototype", manifest: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tier" && args[i + 1]) opts.tier = args[++i];
    if (args[i] === "--manifest" && args[i + 1]) opts.manifest = args[++i];
  }
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function loadProjects() {
  if (!existsSync(PROJECTS_FILE)) return [];
  return JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
}

function saveProject(project) {
  const projects = loadProjects();
  projects.push({
    project_id: project.project_id,
    anon_key: project.anon_key,
    service_key: project.service_key,
    tier: project.tier,
    lease_expires_at: project.lease_expires_at,
    site_url: project.site_url || project.subdomain_url,
    deployed_at: new Date().toISOString(),
  });
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), { mode: 0o600 });
}

async function main() {
  const opts = parseArgs();

  // Load wallet
  if (!existsSync(WALLET_FILE)) {
    console.error(JSON.stringify({ status: "error", message: "No wallet found. Run: node wallet.mjs create && node wallet.mjs fund" }));
    process.exit(1);
  }
  const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));

  // Load manifest
  let manifest;
  if (opts.manifest) {
    manifest = JSON.parse(readFileSync(opts.manifest, "utf-8"));
  } else {
    const stdin = await readStdin();
    manifest = JSON.parse(stdin);
  }

  // Setup x402 client
  const { privateKeyToAccount } = await import("viem/accounts");
  const { createPublicClient, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  const { x402Client, wrapFetchWithPayment } = await import("@x402/fetch");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const { toClientEvmSigner } = await import("@x402/evm");

  const account = privateKeyToAccount(wallet.privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const signer = toClientEvmSigner(account, publicClient);

  const client = new x402Client();
  client.register("eip155:84532", new ExactEvmScheme(signer));
  const fetchPaid = wrapFetchWithPayment(fetch, client);

  // Deploy
  const url = `${API}/v1/deploy/${opts.tier}`;
  const res = await fetchPaid(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });

  const result = await res.json();

  if (!res.ok) {
    console.error(JSON.stringify({ status: "error", http: res.status, ...result }));
    process.exit(1);
  }

  // Save project
  saveProject(result);

  console.log(JSON.stringify(result, null, 2));
}

main();
