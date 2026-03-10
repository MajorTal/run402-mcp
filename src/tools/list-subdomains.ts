import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const listSubdomainsSchema = {
  project_id: z.string().describe("The project ID"),
};

export async function handleListSubdomains(args: {
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

  const res = await apiRequest("/v1/subdomains", {
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

  const subdomains = res.body as Array<{
    name: string;
    url: string;
    deployment_id: string;
    deployment_url: string;
  }>;

  if (subdomains.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `## Subdomains\n\n_No subdomains claimed. Use \`claim_subdomain\` to claim one._`,
        },
      ],
    };
  }

  const lines = [
    `## Subdomains (${subdomains.length})`,
    ``,
    `| Subdomain | URL | Deployment |`,
    `|-----------|-----|------------|`,
  ];

  for (const s of subdomains) {
    lines.push(`| ${s.name} | ${s.url} | \`${s.deployment_id}\` |`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
