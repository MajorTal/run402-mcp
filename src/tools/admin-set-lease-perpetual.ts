import { z } from "zod";
import { getSdk } from "../sdk.js";
import { mapSdkError } from "../errors.js";

export const adminSetLeasePerpetualSchema = {
  billing_account_id: z
    .string()
    .describe(
      "The billing account ID to toggle. Format: ba_…. Platform-admin only — uses the configured allowance wallet for admin auth; project owners with a non-admin SIWX wallet will receive 403 admin_required.",
    ),
  lease_perpetual: z
    .boolean()
    .describe(
      "true → pin every project on the account (account never advances past 'active' regardless of lease expiry). false → resume normal lifecycle advancement. Enabling on a grace-state account reactivates inline (response includes `reactivated: true`). Replaces the v1.56 per-project pin (gateway endpoint /projects/v1/admin/:id/pin was removed in v1.57).",
    ),
};

export async function handleAdminSetLeasePerpetual(args: {
  billing_account_id: string;
  lease_perpetual: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const body = await getSdk().admin.setLeasePerpetual(
      args.billing_account_id,
      args.lease_perpetual,
    );
    const reactivatedNote = body.reactivated
      ? " The account was in a grace state and got pulled back to `active` inline."
      : "";
    return {
      content: [
        {
          type: "text",
          text: `Billing account \`${body.billing_account_id}\` now has \`lease_perpetual=${body.lease_perpetual}\`.${reactivatedNote}`,
        },
      ],
    };
  } catch (err) {
    return mapSdkError(err, "setting billing account lease_perpetual");
  }
}
