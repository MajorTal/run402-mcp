import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { loadProjects, API, PROJECTS_FILE, walletAuthHeaders } from "./config.mjs";

const HELP = `run402 deploy — Deploy a full-stack app or static site on Run402

Usage:
  run402 deploy [options]
  cat manifest.json | run402 deploy [options]

Options:
  --manifest <file>    Path to manifest JSON file  (default: read from stdin)
  --help, -h           Show this help message

Manifest format (JSON):
  {
    "name": "my-app",
    "migrations": "CREATE TABLE items ...",
    "site": [{ "file": "index.html", "data": "<html>...</html>" }],
    "subdomain": "my-app"
  }

Examples:
  run402 deploy --manifest app.json
  cat app.json | run402 deploy

Prerequisites:
  - run402 init                     Set up wallet and funding
  - run402 tier set prototype       Subscribe to a tier

Notes:
  - Requires an active tier subscription (run402 tier set <tier>)
  - Project credentials (project_id, keys, URL) are saved locally after deploy
  - Use 'run402 projects list' to see all deployed projects
`;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function saveProject(project) {
  const projects = loadProjects();
  projects.push({ project_id: project.project_id, anon_key: project.anon_key, service_key: project.service_key, tier: project.tier, lease_expires_at: project.lease_expires_at, site_url: project.site_url || project.subdomain_url, deployed_at: new Date().toISOString() });
  const dir = PROJECTS_FILE.replace(/\/[^/]+$/, "");
  mkdirSync(dir, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), { mode: 0o600 });
}

export async function run(args) {
  const opts = { manifest: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") { console.log(HELP); process.exit(0); }
    if (args[i] === "--manifest" && args[i + 1]) opts.manifest = args[++i];
  }

  const manifest = opts.manifest ? JSON.parse(readFileSync(opts.manifest, "utf-8")) : JSON.parse(await readStdin());

  const authHeaders = await walletAuthHeaders();
  const res = await fetch(`${API}/deploy/v1`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(manifest) });
  const result = await res.json();
  if (!res.ok) { console.error(JSON.stringify({ status: "error", http: res.status, ...result })); process.exit(1); }
  saveProject(result);
  console.log(JSON.stringify(result, null, 2));
}
