import { z } from "zod";
import { getSdk } from "../sdk.js";
import { mapSdkError } from "../errors.js";

export const listProjectsSchema = {
  wallet: z
    .string()
    .describe("Wallet address (0x...) to list projects for"),
};

export async function handleListProjects(args: {
  wallet: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const wallet = args.wallet.toLowerCase();

  try {
    const body = await getSdk().projects.list(wallet);

    if (body.projects.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `## Projects for ${wallet}\n\n_No active projects found._`,
          },
        ],
      };
    }

    const lines = [
      `## Projects for ${wallet} (${body.projects.length})`,
      ``,
      `Tier is per billing account, not per project — every row below shares`,
      `the same account-level tier and quota pool. Use \`tier_status\` to see`,
      `the pooled api_calls / storage_bytes across all of these projects.`,
      ``,
      `Status fields (gateway v1.57+):`,
      `- **Effective status**: derived state for serving — \`active\` /`,
      `  \`past_due\` / \`frozen\` / \`dormant\` / \`archived\` / \`deleted\`.`,
      `- **Account lifecycle**: shared across every project on the same`,
      `  billing account. Differs from effective status when a single project`,
      `  is archived or deleted while siblings keep serving.`,
      `- **Lease perpetual**: operator escape hatch (mirrors the account's`,
      `  \`lease_perpetual\` flag). When \`true\`, the account never advances`,
      `  past \`active\` regardless of lease expiry — replaces the v1.56 pin.`,
      ``,
      `| ID | Name | Account tier | Effective status | Account lifecycle | Lease perpetual |`,
      `|----|------|--------------|------------------|-------------------|-----------------|`,
    ];

    for (const p of body.projects) {
      lines.push(
        `| \`${p.id}\` | ${p.name} | ${p.tier} | ${p.effective_status} | ${p.account_lifecycle_state} | ${p.lease_perpetual ? "yes" : "no"} |`,
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (err) {
    return mapSdkError(err, "listing projects");
  }
}
