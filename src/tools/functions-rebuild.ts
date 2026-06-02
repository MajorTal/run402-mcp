import { z } from "zod";
import { getSdk } from "../sdk.js";
import { mapSdkError } from "../errors.js";

export const functionsRebuildSchema = {
  project_id: z.string().describe("The project ID"),
  name: z
    .string()
    .optional()
    .describe(
      "Function name to rebuild. Omit to rebuild every function in the project (batch).",
    ),
};

/**
 * Render a `before → after` value transition, collapsing to a single value
 * when there is no change (or no prior value was recorded).
 */
function formatTransition(before: string | null, after: string | null): string {
  const a = after ?? "—";
  if (before == null || before === after) return `\`${a}\``;
  return `\`${before}\` → \`${a}\``;
}

export async function handleFunctionsRebuild(args: {
  project_id: string;
  name?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  // Single-function rebuild when a name is given; project-wide otherwise.
  const single = Boolean(args.name);
  const context = single ? "rebuilding function" : "rebuilding functions";
  try {
    if (single) {
      const result = await getSdk().functions.rebuild(args.project_id, args.name!);

      const lines = [
        `## Function Rebuilt`,
        ``,
        `| Field | Value |`,
        `|-------|-------|`,
        `| name | \`${result.name}\` |`,
        `| rebuilt | ${result.rebuilt ? "✅" : "❌"} |`,
        `| Functions runtime version | ${formatTransition(result.runtime_version_before, result.runtime_version_after)} |`,
        `| build fingerprint | ${formatTransition(result.old_fingerprint, result.new_fingerprint)} |`,
        `| code_hash | \`${result.code_hash}\` (unchanged) |`,
        ``,
        `Re-bundled from the function's stored source onto the platform's current runtime. The source \`code_hash\` is unchanged and no new release was created.`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    const result = await getSdk().functions.rebuildAll(args.project_id);

    const lines = [
      `## Functions Rebuilt`,
      ``,
      `Rebuilt ${result.rebuilt_count} of ${result.total} function${result.total === 1 ? "" : "s"} onto the platform's current runtime (source unchanged, no new release).`,
    ];

    if (result.results.length > 0) {
      lines.push(``);
      for (const entry of result.results) {
        if (entry.rebuilt) {
          lines.push(
            `- **${entry.name}** ✅ ${formatTransition(entry.runtime_version_before, entry.runtime_version_after)}`,
          );
        } else {
          const detail = entry.code ? `\`${entry.code}\` — ${entry.error}` : entry.error;
          lines.push(`- **${entry.name}** ❌ ${detail}`);
        }
      }
    }

    // Functions deployed before dependency locking can't be rebuilt
    // deterministically — point at the redeploy-from-source remedy.
    const unlockedNames = result.results
      .filter((e) => !e.rebuilt && e.code === "CANNOT_REBUILD_UNLOCKED_DEPS")
      .map((e) => `\`${e.name}\``);
    if (unlockedNames.length > 0) {
      lines.push(
        ``,
        `**Note:** ${unlockedNames.join(", ")} ${unlockedNames.length === 1 ? "was" : "were"} deployed before dependency locking and can't be rebuilt deterministically. Redeploy from source with \`deploy_function\` to refresh the runtime.`,
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (err) {
    return mapSdkError(err, context);
  }
}
