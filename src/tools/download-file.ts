import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const downloadFileSchema = {
  project_id: z.string().describe("The project ID"),
  bucket: z.string().describe("Storage bucket name"),
  path: z.string().describe("File path within the bucket"),
};

export async function handleDownloadFile(args: {
  project_id: string;
  bucket: string;
  path: string;
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

  const apiPath = `/storage/v1/object/${args.bucket}/${args.path}`;

  const res = await apiRequest(apiPath, {
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

  const content = typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2);

  return {
    content: [
      {
        type: "text",
        text: `**${args.bucket}/${args.path}:**\n\n\`\`\`\n${content}\n\`\`\``,
      },
    ],
  };
}
