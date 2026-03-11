#!/usr/bin/env node
/**
 * Run402 project manager — list, inspect, query, renew, delete projects.
 *
 * Usage:
 *   node projects.mjs list                          # List saved projects
 *   node projects.mjs sql <project_id> "SELECT 1"   # Run SQL
 *   node projects.mjs rest <project_id> <table> [query_params]  # REST query
 *   node projects.mjs usage <project_id>             # Check usage vs limits
 *   node projects.mjs schema <project_id>            # Inspect tables/columns/RLS
 *   node projects.mjs renew <project_id>             # Renew lease (x402 payment)
 *   node projects.mjs delete <project_id>            # Archive and delete project
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = process.env.RUN402_CONFIG_DIR || join(homedir(), ".config", "run402");
const WALLET_FILE = join(CONFIG_DIR, "wallet.json");
const PROJECTS_FILE = join(CONFIG_DIR, "projects.json");
const API = process.env.RUN402_API_BASE || "https://api.run402.com";

function loadProjects() {
  if (!existsSync(PROJECTS_FILE)) return [];
  return JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
}

function saveProjects(projects) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), { mode: 0o600 });
}

function findProject(id) {
  const projects = loadProjects();
  const p = projects.find(p => p.project_id === id);
  if (!p) { console.error(`Project ${id} not found in local registry.`); process.exit(1); }
  return p;
}

async function setupPaidFetch() {
  if (!existsSync(WALLET_FILE)) {
    console.error(JSON.stringify({ status: "error", message: "No wallet found. Run: node wallet.mjs create && node wallet.mjs fund" }));
    process.exit(1);
  }
  const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));

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
  return wrapFetchWithPayment(fetch, client);
}

async function list() {
  const projects = loadProjects();
  if (projects.length === 0) {
    console.log(JSON.stringify({ status: "ok", projects: [], message: "No projects yet." }));
    return;
  }
  console.log(JSON.stringify(projects.map(p => ({
    project_id: p.project_id,
    tier: p.tier,
    site_url: p.site_url,
    lease_expires_at: p.lease_expires_at,
    deployed_at: p.deployed_at,
  })), null, 2));
}

async function sql(projectId, query) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/admin/v1/projects/${projectId}/sql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${p.service_key}`,
      "Content-Type": "text/plain",
    },
    body: query,
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function rest(projectId, table, queryParams) {
  const p = findProject(projectId);
  const url = `${API}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
  const res = await fetch(url, { headers: { "apikey": p.anon_key } });
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function usage(projectId) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/admin/v1/projects/${projectId}/usage`, {
    headers: { "Authorization": `Bearer ${p.service_key}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify({ status: "error", http: res.status, ...data }));
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

async function schema(projectId) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/admin/v1/projects/${projectId}/schema`, {
    headers: { "Authorization": `Bearer ${p.service_key}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify({ status: "error", http: res.status, ...data }));
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

async function renew(projectId) {
  const p = findProject(projectId);
  const fetchPaid = await setupPaidFetch();

  const res = await fetchPaid(`${API}/v1/projects/${projectId}/renew`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify({ status: "error", http: res.status, ...data }));
    process.exit(1);
  }

  // Update local project record
  const projects = loadProjects();
  const idx = projects.findIndex(pr => pr.project_id === projectId);
  if (idx >= 0 && data.lease_expires_at) {
    projects[idx].lease_expires_at = data.lease_expires_at;
    saveProjects(projects);
  }

  console.log(JSON.stringify(data, null, 2));
}

async function deleteProject(projectId) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/v1/projects/${projectId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${p.service_key}` },
  });

  if (res.status === 204 || res.ok) {
    // Remove from local registry
    const projects = loadProjects().filter(pr => pr.project_id !== projectId);
    saveProjects(projects);
    console.log(JSON.stringify({ status: "ok", message: `Project ${projectId} deleted.` }));
  } else {
    const data = await res.json().catch(() => ({}));
    console.error(JSON.stringify({ status: "error", http: res.status, ...data }));
    process.exit(1);
  }
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "list": await list(); break;
  case "sql": await sql(args[0], args[1]); break;
  case "rest": await rest(args[0], args[1], args[2]); break;
  case "usage": await usage(args[0]); break;
  case "schema": await schema(args[0]); break;
  case "renew": await renew(args[0]); break;
  case "delete": await deleteProject(args[0]); break;
  default:
    console.log("Usage: node projects.mjs <list|sql|rest|usage|schema|renew|delete> [args...]");
    process.exit(1);
}
