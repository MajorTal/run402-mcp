/**
 * Run402 config loader — reads local project and wallet state.
 * Kept in a separate module so credential reads stay isolated.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const CONFIG_DIR = join(homedir(), ".config", "run402");
export const WALLET_FILE = join(CONFIG_DIR, "wallet.json");
export const PROJECTS_FILE = join(CONFIG_DIR, "projects.json");
export const API = "https://api.run402.com";

export function readWallet() {
  if (!existsSync(WALLET_FILE)) return null;
  return JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
}

export function saveWallet(data) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  try { chmodSync(WALLET_FILE, 0o600); } catch {}
}

export function loadProjects() {
  if (!existsSync(PROJECTS_FILE)) return [];
  return JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
}

export function saveProjects(projects) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), { mode: 0o600 });
}

export async function walletAuthHeaders() {
  const w = readWallet();
  if (!w) { console.error(JSON.stringify({ status: "error", message: "No wallet found. Run: node wallet.mjs create" })); process.exit(1); }
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(w.privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await account.signMessage({ message: `run402:${timestamp}` });
  return { "X-Run402-Wallet": account.address, "X-Run402-Signature": signature, "X-Run402-Timestamp": timestamp };
}

export function findProject(id) {
  const p = loadProjects().find(p => p.project_id === id);
  if (!p) { console.error(`Project ${id} not found in local registry.`); process.exit(1); }
  return p;
}
