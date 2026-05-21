/**
 * Pure manifest-resolution logic for `@run402/astro/build-manifest`.
 *
 * Split out into its own module because Node's ESM loader rejects the
 * `virtual:` URL scheme used by `virtual:run402-assetmap`. The public
 * `getBuildTimeManifest()` in `build-manifest.ts` imports the virtual
 * module + delegates option-application to this file's
 * `resolveManifestWithOptions`. Tests import from THIS module so they
 * can verify the option + version-guard logic without trying to load
 * the virtual specifier at test runtime.
 *
 * Consumers should NOT import from this module directly — its only
 * caller is `build-manifest.ts`. Treating it as a public API would
 * make the test/runtime split visible to users.
 */

import type { AssetManifest } from "./manifest.js";

export interface GetBuildTimeManifestOptions {
  projectId?: string;
  assetPrefix?: string;
  generatedAt?: string;
}

export function resolveManifestWithOptions(
  source: AssetManifest | null,
  options: GetBuildTimeManifestOptions = {},
): AssetManifest | null {
  if (!source) return null;
  // Defensive: virtual module could in principle have a shape mismatch
  // (older integration version, partial setup). Validate the version
  // field; treat unknowns as null.
  if (source.version !== 1) return null;

  // Identity guarantee: pass-through when no overrides are supplied,
  // so consumers that memoize by manifest reference don't see spurious
  // re-renders.
  if (
    options.projectId === undefined &&
    options.assetPrefix === undefined &&
    options.generatedAt === undefined
  ) {
    return source;
  }
  return {
    ...source,
    ...(options.projectId !== undefined && { project_id: options.projectId }),
    ...(options.assetPrefix !== undefined && { asset_prefix: options.assetPrefix }),
    ...(options.generatedAt !== undefined && { generated_at: options.generatedAt }),
  };
}
