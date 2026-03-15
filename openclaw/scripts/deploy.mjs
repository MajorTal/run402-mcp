#!/usr/bin/env node
/**
 * Run402 deploy — bundle deploy a full-stack app.
 *
 * Usage:
 *   node deploy.mjs --manifest manifest.json
 *   echo '{"name":"app","site":[...]}' | node deploy.mjs
 *
 * Manifest JSON fields (passed to POST /deploy/v1):
 *   name, migrations, rls, secrets, functions, site, subdomain
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { loadProjects, walletAuthHeaders, API, PROJECTS_FILE } from "./config.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { manifest: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest" && args[i + 1]) opts.manifest = args[++i];
  }
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
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
  const dir = PROJECTS_FILE.replace(/\/[^/]+$/, "");
  mkdirSync(dir, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), { mode: 0o600 });
}

async function main() {
  const opts = parseArgs();

  const authHeaders = await walletAuthHeaders();

  let manifest;
  if (opts.manifest) {
    manifest = JSON.parse(readFileSync(opts.manifest, "utf-8"));
  } else {
    manifest = JSON.parse(await readStdin());
  }

  const res = await fetch(`${API}/deploy/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(manifest),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error(JSON.stringify({ status: "error", http: res.status, ...result }));
    process.exit(1);
  }

  saveProject(result);
  console.log(JSON.stringify(result, null, 2));
}

main();
