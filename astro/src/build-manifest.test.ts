/**
 * Tests for `@run402/astro/build-manifest`.
 *
 * The public entry point `getBuildTimeManifest()` imports from
 * `virtual:run402-assetmap`, which Node's ESM loader rejects outside
 * Vite (`ERR_UNSUPPORTED_ESM_URL_SCHEME`). The actual coercion +
 * option-application logic lives in `resolveManifestWithOptions`,
 * exported separately for this test suite to exercise without needing
 * Vite alive. `getBuildTimeManifest()` is a one-line wrapper:
 *
 *     getBuildTimeManifest(opts) = resolveManifestWithOptions(virtualManifest, opts);
 *
 * Verifying `resolveManifestWithOptions` against every code path covers
 * the public function modulo the trivial virtual-module read.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveManifestWithOptions } from "./build-manifest-resolver.js";
import type { AssetManifest } from "./manifest.js";
import type { AssetRef } from "./types.js";

const sampleRef: AssetRef = {
  key: "astro/hero.jpg",
  sha256: "a".repeat(64),
  size_bytes: 100000,
  content_type: "image/jpeg",
  url: "https://example.com/hero.jpg",
  cdn_url: "https://cdn.example.com/hero.jpg",
  width_px: 1600,
  height_px: 1200,
  blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
  variant_spec_version: "v1",
  display_url: "https://cdn.example.com/hero.jpg",
};

const sampleManifest: AssetManifest = {
  version: 1,
  project_id: "prj_test",
  asset_prefix: "astro/",
  generated_at: "2026-05-21T10:00:00.000Z",
  assets: { "hero.jpg": sampleRef },
};

describe("resolveManifestWithOptions", () => {
  it("returns null when the source manifest is null", () => {
    assert.equal(resolveManifestWithOptions(null), null);
    assert.equal(resolveManifestWithOptions(null, { projectId: "x" }), null);
  });

  it("returns the manifest reference unchanged when no options are passed", () => {
    const got = resolveManifestWithOptions(sampleManifest);
    assert.strictEqual(got, sampleManifest);
  });

  it("returns a new object when at least one override is applied", () => {
    const got = resolveManifestWithOptions(sampleManifest, { projectId: "prj_override" });
    assert.notStrictEqual(got, sampleManifest);
    assert.ok(got);
    assert.equal(got.project_id, "prj_override");
    assert.equal(sampleManifest.project_id, "prj_test", "source must not be mutated");
  });

  it("applies all three overrides at once", () => {
    const got = resolveManifestWithOptions(sampleManifest, {
      projectId: "prj_o",
      assetPrefix: "my-app/",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(got);
    assert.equal(got.project_id, "prj_o");
    assert.equal(got.asset_prefix, "my-app/");
    assert.equal(got.generated_at, "2026-01-01T00:00:00.000Z");
    // Untouched fields propagate.
    assert.deepEqual(Object.keys(got.assets), ["hero.jpg"]);
    assert.equal(got.assets["hero.jpg"]?.cdn_url, sampleRef.cdn_url);
  });

  it("treats unknown manifest versions as null (forward-compat guard)", () => {
    const future = { ...sampleManifest, version: 2 } as unknown as AssetManifest;
    assert.equal(resolveManifestWithOptions(future), null);
    // Even with overrides, the version guard takes precedence.
    assert.equal(resolveManifestWithOptions(future, { projectId: "x" }), null);
  });

  it("does not run the override path when all options are undefined", () => {
    // Identity guarantee: passing an empty options object should return
    // the same reference, not a clone — this matters for renderers that
    // memoize by manifest identity.
    const got = resolveManifestWithOptions(sampleManifest, {});
    assert.strictEqual(got, sampleManifest);
  });
});
