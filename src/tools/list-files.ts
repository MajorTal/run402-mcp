import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const listFilesSchema = {
  project_id: z.string().describe("The project ID"),
  bucket: z.string().describe("Storage bucket name"),
};

export async function handleListFiles(args: {
  project_id: string;
  bucket: string;
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

  const res = await apiRequest(`/storage/v1/object/list/${args.bucket}`, {
    method: "GET",
    headers: {
      apikey: project.anon_key,
      Authorization: `Bearer ${project.anon_key}`,
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
    objects: Array<{ key: string; size: number; last_modified: string }>;
  };

  if (body.objects.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `## Files in \`${args.bucket}\`\n\n_No files found._`,
        },
      ],
    };
  }

  const lines = [
    `## Files in \`${args.bucket}\` (${body.objects.length})`,
    ``,
    `| File | Size | Modified |`,
    `|------|------|----------|`,
  ];

  for (const obj of body.objects) {
    const size =
      obj.size < 1024
        ? `${obj.size}B`
        : `${(obj.size / 1024).toFixed(1)}KB`;
    lines.push(`| ${obj.key} | ${size} | ${obj.last_modified} |`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
