import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";

export const deleteFunctionSchema = {
  project_id: z.string().describe("The project ID"),
  name: z.string().describe("Function name to delete"),
};

export async function handleDeleteFunction(args: {
  project_id: string;
  name: string;
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

  const res = await apiRequest(
    `/admin/v1/projects/${args.project_id}/functions/${encodeURIComponent(args.name)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${project.service_key}`,
      },
    },
  );

  if (!res.ok) {
    const body = res.body as Record<string, unknown>;
    const msg = (body.error as string) || `HTTP ${res.status}`;
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Function \`${args.name}\` deleted from project \`${args.project_id}\`.`,
      },
    ],
  };
}
