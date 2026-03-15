/**
 * Wallet auth helper — generates EIP-191 signature headers for Run402 API.
 *
 * Used by MCP tools that call wallet-authenticated endpoints.
 * Reads the local wallet from ~/.config/run402/wallet.json.
 */

import { readFileSync, existsSync } from "node:fs";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getWalletPath } from "./config.js";

export interface WalletAuthHeaders {
  "X-Run402-Wallet": string;
  "X-Run402-Signature": string;
  "X-Run402-Timestamp": string;
}

/**
 * EIP-191 personal_sign: sign a message with the wallet's private key.
 */
function personalSign(privateKeyHex: string, address: string, message: string): string {
  const msgBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(
    `\x19Ethereum Signed Message:\n${msgBytes.length}`,
  );
  const prefixed = new Uint8Array(prefix.length + msgBytes.length);
  prefixed.set(prefix);
  prefixed.set(msgBytes, prefix.length);

  const hash = keccak_256(prefixed);
  const pkHex = privateKeyHex.startsWith("0x")
    ? privateKeyHex.slice(2)
    : privateKeyHex;
  const pkBytes = Uint8Array.from(Buffer.from(pkHex, "hex"));
  const rawSig = secp256k1.sign(hash, pkBytes);
  const sig = secp256k1.Signature.fromBytes(rawSig);

  // Determine recovery bit by trying both and matching the address
  let recovery = 0;
  for (const v of [0, 1]) {
    try {
      const recovered = sig.addRecoveryBit(v).recoverPublicKey(hash);
      const pubBytes = recovered.toBytes(false).slice(1); // uncompressed, drop 04 prefix
      const addrBytes = keccak_256(pubBytes).slice(-20);
      if ("0x" + bytesToHex(addrBytes) === address.toLowerCase()) {
        recovery = v;
        break;
      }
    } catch {
      continue;
    }
  }

  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const vHex = (recovery + 27).toString(16).padStart(2, "0");
  return "0x" + r + s + vHex;
}

/**
 * Get wallet auth headers for the Run402 API.
 * Returns null if no wallet is configured.
 */
export function getWalletAuthHeaders(): WalletAuthHeaders | null {
  const walletPath = getWalletPath();
  if (!existsSync(walletPath)) return null;

  let wallet: { address: string; privateKey: string };
  try {
    wallet = JSON.parse(readFileSync(walletPath, "utf-8"));
  } catch {
    return null;
  }

  if (!wallet.address || !wallet.privateKey) return null;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = personalSign(wallet.privateKey, wallet.address, `run402:${timestamp}`);

  return {
    "X-Run402-Wallet": wallet.address,
    "X-Run402-Signature": signature,
    "X-Run402-Timestamp": timestamp,
  };
}

/**
 * Get wallet auth headers or return an MCP error result.
 */
export function requireWalletAuth(): {
  headers: WalletAuthHeaders;
} | {
  error: { content: Array<{ type: "text"; text: string }>; isError: true };
} {
  const headers = getWalletAuthHeaders();
  if (!headers) {
    return {
      error: {
        content: [
          {
            type: "text",
            text: "Error: No wallet configured. Use `wallet_create` to create a wallet first, then `request_faucet` to fund it.",
          },
        ],
        isError: true,
      },
    };
  }
  return { headers };
}
