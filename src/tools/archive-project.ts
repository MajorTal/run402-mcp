import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject, loadKeyStore, saveKeyStore } from "../keystore.js";

export const archiveProjectSchema = {
  project_id: z.string().describe("The project ID to archive"),
};

export async function handleArchiveProject(args: {
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

  const res = await apiRequest(`/v1/projects/${args.project_id}`, {
    method: "DELETE",
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

  // Remove from local key store
  const store = loadKeyStore();
  delete store.projects[args.project_id];
  saveKeyStore(store);

  return {
    content: [
      {
        type: "text",
        text: `Project \`${args.project_id}\` archived and removed from local key store.`,
      },
    ],
  };
}
