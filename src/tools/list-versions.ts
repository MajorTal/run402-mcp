import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const listVersionsSchema = {
  project_id: z.string().describe("The project ID"),
};

export async function handleListVersions(args: {
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

  const res = await apiRequest(`/admin/v1/projects/${args.project_id}/versions`, {
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
    versions: Array<{
      id: string;
      description: string | null;
      tags: string[];
      visibility: string;
      fork_allowed: boolean;
      created_at: string;
    }>;
  };

  if (body.versions.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `## Versions\n\n_No published versions. Use \`publish_app\` to publish one._`,
        },
      ],
    };
  }

  const lines = [
    `## Versions (${body.versions.length})`,
    ``,
    `| ID | Visibility | Forkable | Tags | Created |`,
    `|----|------------|----------|------|---------|`,
  ];

  for (const v of body.versions) {
    const tags = v.tags.length > 0 ? v.tags.join(", ") : "-";
    lines.push(
      `| \`${v.id}\` | ${v.visibility} | ${v.fork_allowed ? "Yes" : "No"} | ${tags} | ${v.created_at} |`,
    );
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
