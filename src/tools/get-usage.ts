import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const getUsageSchema = {
  project_id: z.string().describe("The project ID"),
};

export async function handleGetUsage(args: {
  project_id: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const project = getProject(args.project_id);
  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Project \`${args.project_id}\` not found in key store. Provision a project first.`,
        },
      ],
      isError: true,
    };
  }

  const res = await apiRequest(`/admin/v1/projects/${args.project_id}/usage`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${project.service_key}`,
    },
  });

  if (!res.ok) {
    const body = res.body as Record<string, unknown>;
    const msg = (body.error as string) || `HTTP ${res.status}`;
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }

  const body = res.body as {
    project_id: string;
    tier: string;
    api_calls: number;
    api_calls_limit: number;
    storage_bytes: number;
    storage_limit_bytes: number;
    lease_expires_at: string;
    status: string;
  };

  const storageMB = (body.storage_bytes / (1024 * 1024)).toFixed(1);
  const storageLimitMB = (body.storage_limit_bytes / (1024 * 1024)).toFixed(0);
  const apiPct = ((body.api_calls / body.api_calls_limit) * 100).toFixed(1);
  const storagePct = ((body.storage_bytes / body.storage_limit_bytes) * 100).toFixed(1);

  const lines = [
    `## Usage: \`${body.project_id}\``,
    ``,
    `| Metric | Used | Limit | % |`,
    `|--------|------|-------|---|`,
    `| API calls | ${body.api_calls.toLocaleString()} | ${body.api_calls_limit.toLocaleString()} | ${apiPct}% |`,
    `| Storage | ${storageMB}MB | ${storageLimitMB}MB | ${storagePct}% |`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| tier | ${body.tier} |`,
    `| status | ${body.status} |`,
    `| expires | ${body.lease_expires_at} |`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
