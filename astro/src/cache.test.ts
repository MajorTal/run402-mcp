import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { BuildCache } from "./cache.js";
import type { AssetRef } from "./types.js";

const sampleRef: AssetRef = {
  key: "astro/hero.jpg",
  sha256: "deadbeef".padEnd(64, "0"),
  size_bytes: 1234,
  content_type: "image/jpeg",
  url: "https://example.com/hero.jpg",
  cdn_url: "https://cdn.example.com/hero.jpg",
  width_px: 1600,
  height_px: 1200,
  blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
  variant_spec_version: "v1",
  display_url: "https://cdn.example.com/hero.jpg",
};

describe("BuildCache", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "r402-cache-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns null on cache miss", () => {
    const cache = new BuildCache(root);
    assert.equal(cache.get("/abs/foo.jpg", "any-sha"), null);
  });

  it("returns the cached AssetRef when sha matches", () => {
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const got = cache.get("/abs/hero.jpg", sampleRef.sha256);
    assert.deepEqual(got, sampleRef);
  });

  it("returns null when sha differs (cache invalidation on content change)", () => {
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const got = cache.get("/abs/hero.jpg", "differentshadifferentshadifferent");
    assert.equal(got, null);
  });

  it("persists across instances", () => {
    const cache1 = new BuildCache(root);
    cache1.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const cache2 = new BuildCache(root);
    const got = cache2.get("/abs/hero.jpg", sampleRef.sha256);
    assert.deepEqual(got, sampleRef);
  });

  it("creates node_modules/.run402/assetMap.json on first set()", () => {
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const expected = join(root, "node_modules", ".run402", "assetMap.json");
    assert.ok(existsSync(expected), "cache file should exist");
    const parsed = JSON.parse(readFileSync(expected, "utf-8"));
    // Cache schema is currently v2 (v1.50 + v1.54 AssetRef additions).
    // Bumping CACHE_SCHEMA_VERSION should also bump this assertion AND
    // add a new "drops a v<previous> cache file" test to the migration
    // suite below — see cache.ts header for the rationale.
    assert.equal(parsed.version, 2);
    assert.ok(parsed.entries["/abs/hero.jpg"]);
  });

  it("creates .gitignore with cache dir entry on first set()", () => {
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const gi = join(root, ".gitignore");
    assert.ok(existsSync(gi), ".gitignore should exist");
    const content = readFileSync(gi, "utf-8");
    assert.match(content, /node_modules\/\.run402\//);
  });

  it("appends to existing .gitignore without dupes", () => {
    writeFileSync(join(root, ".gitignore"), "dist/\nnode_modules/\n", "utf-8");
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const content = readFileSync(join(root, ".gitignore"), "utf-8");
    assert.match(content, /^dist\/$/m);
    assert.match(content, /^node_modules\/$/m);
    assert.match(content, /^node_modules\/\.run402\/$/m);
  });

  it("does not append .gitignore line when already present", () => {
    writeFileSync(
      join(root, ".gitignore"),
      "node_modules/.run402/\nother-entry/\n",
      "utf-8",
    );
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    const content = readFileSync(join(root, ".gitignore"), "utf-8");
    const matches = content.match(/node_modules\/\.run402/g);
    assert.equal(matches?.length, 1, "should appear exactly once");
  });

  it("delete() removes an entry", () => {
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", sampleRef.sha256, sampleRef);
    assert.equal(cache.size(), 1);
    cache.delete("/abs/hero.jpg");
    assert.equal(cache.size(), 0);
    assert.equal(cache.get("/abs/hero.jpg", sampleRef.sha256), null);
  });

  it("corrupt cache file is treated as empty (does not throw)", async () => {
    const cacheDir = join(root, "node_modules", ".run402");
    const { mkdirSync: mkdir, writeFileSync: writeFile } = await import("node:fs");
    mkdir(cacheDir, { recursive: true });
    writeFile(join(cacheDir, "assetMap.json"), "{not json{}", "utf-8");
    const cache = new BuildCache(root);
    assert.equal(cache.size(), 0);
  });

  // Regression: pre-v2 cache files (written before v1.54 AssetRef shape
  // added `blurhash_data_url` + `asset_schema`) were silently returned
  // verbatim on cache hit, dropping the new fields from
  // `dist/_assets-manifest.json`. Bumping CACHE_SCHEMA_VERSION to 2
  // invalidates those caches and forces a fresh AssetRef on the next
  // build. If this test fails after a future schema bump, also bump
  // CACHE_SCHEMA_VERSION here AND add a new test asserting v2 caches
  // are dropped at the new version.
  it("drops a v1 cache file on load (schema migration v1 → v2)", async () => {
    const cacheDir = join(root, "node_modules", ".run402");
    const { mkdirSync: mkdir, writeFileSync: writeFile } = await import("node:fs");
    mkdir(cacheDir, { recursive: true });
    const v1File = {
      version: 1,
      entries: {
        "/abs/legacy.jpg": {
          sha256: sampleRef.sha256,
          assetRef: sampleRef,
          cachedAt: Date.now() - 86_400_000,
        },
      },
    };
    writeFile(join(cacheDir, "assetMap.json"), JSON.stringify(v1File), "utf-8");
    const cache = new BuildCache(root);
    assert.equal(cache.size(), 0, "v1 entries should be discarded");
    assert.equal(
      cache.get("/abs/legacy.jpg", sampleRef.sha256),
      null,
      "lookup against the pre-bump entry must miss so the uploader re-fetches a fresh AssetRef",
    );
  });

  it("round-trips v1.54 fields (blurhash_data_url + asset_schema) through set/get", () => {
    const v154Ref: AssetRef = {
      ...sampleRef,
      metadata: { tag: "hero" },
      image_format: "jpeg",
      image_info: { has_alpha: false, color_space: "srgb" },
      image_exif: null,
      image_exif_policy: "strip",
      blurhash_data_url: "data:image/png;base64,iVBORw0KGgoAAAA",
      asset_schema: "v1.54",
    };
    const cache = new BuildCache(root);
    cache.set("/abs/hero.jpg", v154Ref.sha256, v154Ref);

    // Same-process read.
    const same = cache.get("/abs/hero.jpg", v154Ref.sha256);
    assert.deepEqual(same, v154Ref);

    // Roundtrip via the on-disk file (catches accidental field stripping
    // in flush()/load(), which is the actual class of bug v2 prevents).
    const fresh = new BuildCache(root);
    const reloaded = fresh.get("/abs/hero.jpg", v154Ref.sha256);
    assert.deepEqual(reloaded, v154Ref);
    assert.equal(reloaded?.blurhash_data_url, v154Ref.blurhash_data_url);
    assert.equal(reloaded?.asset_schema, "v1.54");
  });
});
