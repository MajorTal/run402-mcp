import { z } from "zod";
import { apiRequest } from "../client.js";

export const getQuoteSchema = {};

export async function handleGetQuote(_args: Record<string, never>): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const res = await apiRequest("/v1/projects", { method: "GET" });

  if (!res.ok) {
    const body = res.body as Record<string, unknown>;
    const msg = (body.error as string) || `HTTP ${res.status}`;
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }

  const body = res.body as {
    tiers: Record<
      string,
      { price: string; lease_days: number; storage_mb: number; api_calls: number }
    >;
  };

  const lines = [
    `## Run402 Pricing`,
    ``,
    `| Tier | Price (USDC) | Lease | Storage | API Calls |`,
    `|------|-------------|-------|---------|-----------|`,
  ];

  for (const [name, tier] of Object.entries(body.tiers)) {
    lines.push(
      `| ${name} | $${tier.price} | ${tier.lease_days}d | ${tier.storage_mb}MB | ${(tier.api_calls / 1000).toFixed(0)}k |`,
    );
  }

  lines.push(``);
  lines.push(`Use \`provision_postgres_project\` or \`bundle_deploy\` to create a project.`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
