import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const listSecretsSchema = {
  project_id: z.string().describe("The project ID"),
};

export async function handleListSecrets(args: {
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

  const res = await apiRequest(`/admin/v1/projects/${args.project_id}/secrets`, {
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

  const body = res.body as { secrets: Array<{ key: string }> };

  if (body.secrets.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `## Secrets\n\n_No secrets set. Use \`set_secret\` to add one._`,
        },
      ],
    };
  }

  const lines = [
    `## Secrets (${body.secrets.length})`,
    ``,
    ...body.secrets.map((s) => `- \`${s.key}\``),
    ``,
    `_Values are not shown for security._`,
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
