import { findProject, loadProjects, saveProjects, readWallet, API, WALLET_FILE } from "./config.mjs";
import { existsSync } from "fs";

const HELP = `run402 projects — Manage your deployed Run402 projects

Usage:
  run402 projects <subcommand> [args...]

Subcommands:
  list                           List all your projects (IDs, tiers, URLs, expiry)
  sql   <id> "<query>"           Run a SQL query against a project's Postgres DB
  rest  <id> <table> [params]    Query a table via the REST API (PostgREST)
  usage <id>                     Show compute/storage usage for a project
  schema <id>                    Inspect the database schema
  renew <id>                     Extend the project lease (pays via x402)
  delete <id>                    Delete a project and remove it from local state

Examples:
  run402 projects list
  run402 projects sql abc123 "SELECT * FROM users LIMIT 5"
  run402 projects rest abc123 users "limit=10&select=id,name"
  run402 projects usage abc123
  run402 projects schema abc123
  run402 projects renew abc123
  run402 projects delete abc123

Notes:
  - <id> is the project_id shown in 'run402 projects list'
  - 'rest' uses PostgREST query syntax (table name + optional query string)
  - 'renew' requires a funded wallet — payment is automatic via x402
`;

async function setupPaidFetch() {
  if (!existsSync(WALLET_FILE)) {
    console.error(JSON.stringify({ status: "error", message: "No wallet found. Run: run402 wallet create && run402 wallet fund" }));
    process.exit(1);
  }
  const wallet = readWallet();
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
  if (projects.length === 0) { console.log(JSON.stringify({ status: "ok", projects: [], message: "No projects yet." })); return; }
  console.log(JSON.stringify(projects.map(p => ({ project_id: p.project_id, tier: p.tier, site_url: p.site_url, lease_expires_at: p.lease_expires_at, deployed_at: p.deployed_at })), null, 2));
}

async function sqlCmd(projectId, query) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/admin/v1/projects/${projectId}/sql`, { method: "POST", headers: { "Authorization": `Bearer ${p.service_key}`, "Content-Type": "text/plain" }, body: query });
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function rest(projectId, table, queryParams) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`, { headers: { "apikey": p.anon_key } });
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function usage(projectId) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/admin/v1/projects/${projectId}/usage`, { headers: { "Authorization": `Bearer ${p.service_key}` } });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

async function schema(projectId) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/admin/v1/projects/${projectId}/schema`, { headers: { "Authorization": `Bearer ${p.service_key}` } });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}

async function renew(projectId) {
  const fetchPaid = await setupPaidFetch();
  const res = await fetchPaid(`${API}/v1/projects/${projectId}/renew`, { method: "POST", headers: { "Content-Type": "application/json" } });
  const data = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1); }
  const projects = loadProjects();
  const idx = projects.findIndex(pr => pr.project_id === projectId);
  if (idx >= 0 && data.lease_expires_at) { projects[idx].lease_expires_at = data.lease_expires_at; saveProjects(projects); }
  console.log(JSON.stringify(data, null, 2));
}

async function deleteProject(projectId) {
  const p = findProject(projectId);
  const res = await fetch(`${API}/v1/projects/${projectId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${p.service_key}` } });
  if (res.status === 204 || res.ok) {
    saveProjects(loadProjects().filter(pr => pr.project_id !== projectId));
    console.log(JSON.stringify({ status: "ok", message: `Project ${projectId} deleted.` }));
  } else {
    const data = await res.json().catch(() => ({}));
    console.error(JSON.stringify({ status: "error", http: res.status, ...data })); process.exit(1);
  }
}

export async function run(sub, args) {
  if (!sub || sub === '--help' || sub === '-h') {
    console.log(HELP);
    process.exit(0);
  }
  switch (sub) {
    case "list":   await list(); break;
    case "sql":    await sqlCmd(args[0], args[1]); break;
    case "rest":   await rest(args[0], args[1], args[2]); break;
    case "usage":  await usage(args[0]); break;
    case "schema": await schema(args[0]); break;
    case "renew":  await renew(args[0]); break;
    case "delete": await deleteProject(args[0]); break;
    default:
      console.error(`Unknown subcommand: ${sub}\n`);
      console.log(HELP);
      process.exit(1);
  }
}
