#!/usr/bin/env node
/**
 * Run402 wallet manager — persistent wallet for OpenClaw agents.
 *
 * Usage:
 *   node wallet.mjs status          # Show address, balance, network
 *   node wallet.mjs create          # Generate and save a new wallet (fails if one exists)
 *   node wallet.mjs fund            # Request testnet USDC from faucet
 *   node wallet.mjs export          # Print wallet address (safe for sharing)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = process.env.RUN402_CONFIG_DIR || join(homedir(), ".config", "run402");
const WALLET_FILE = join(CONFIG_DIR, "wallet.json");
const API = process.env.RUN402_API_BASE || "https://api.run402.com";

async function loadDeps() {
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const { createPublicClient, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  return { generatePrivateKey, privateKeyToAccount, createPublicClient, http, baseSepolia };
}

function readWallet() {
  if (!existsSync(WALLET_FILE)) return null;
  return JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
}

function saveWallet(data) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  try { chmodSync(WALLET_FILE, 0o600); } catch {}
}

async function status() {
  const w = readWallet();
  if (!w) {
    console.log(JSON.stringify({ status: "no_wallet", message: "No wallet found. Run: node wallet.mjs create" }));
    return;
  }
  // Check balance via faucet-compatible endpoint or just report stored info
  console.log(JSON.stringify({
    status: "ok",
    address: w.address,
    network: w.network || "base-sepolia",
    created: w.created,
    funded: w.funded || false,
  }));
}

async function create() {
  if (readWallet()) {
    console.log(JSON.stringify({ status: "error", message: "Wallet already exists. Use 'status' to check it." }));
    process.exit(1);
  }
  const { generatePrivateKey, privateKeyToAccount } = await loadDeps();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const data = {
    address: account.address,
    privateKey,
    network: "base-sepolia",
    created: new Date().toISOString(),
    funded: false,
  };
  saveWallet(data);
  console.log(JSON.stringify({ status: "ok", address: account.address, message: "Wallet created and saved." }));
}

async function fund() {
  const w = readWallet();
  if (!w) {
    console.log(JSON.stringify({ status: "error", message: "No wallet. Run: node wallet.mjs create" }));
    process.exit(1);
  }
  const res = await fetch(`${API}/v1/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: w.address }),
  });
  const data = await res.json();
  if (res.ok) {
    w.funded = true;
    w.lastFaucet = new Date().toISOString();
    saveWallet(w);
    console.log(JSON.stringify({ status: "ok", ...data }));
  } else {
    console.log(JSON.stringify({ status: "error", ...data }));
    process.exit(1);
  }
}

async function exportAddr() {
  const w = readWallet();
  if (!w) {
    console.log(JSON.stringify({ status: "error", message: "No wallet." }));
    process.exit(1);
  }
  console.log(w.address);
}

const cmd = process.argv[2];
switch (cmd) {
  case "status": await status(); break;
  case "create": await create(); break;
  case "fund": await fund(); break;
  case "export": await exportAddr(); break;
  default:
    console.log("Usage: node wallet.mjs <status|create|fund|export>");
    process.exit(1);
}
