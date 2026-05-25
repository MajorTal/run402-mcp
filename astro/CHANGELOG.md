# Changelog

All notable changes to `@run402/astro`.

## Unreleased

### Fixed

- **Stale `dist/_assets-manifest.json` entries missing v1.54 AssetRef fields.** The build cache at `node_modules/.run402/assetMap.json` stores AssetRefs verbatim by source SHA; when the gateway started emitting `blurhash_data_url` + `asset_schema` (v1.54), existing caches kept returning pre-v1.54 AssetRefs on hit, silently producing manifests that looked correct (legacy fields populated) but lacked the v1.54 additions. Bumped `CACHE_SCHEMA_VERSION` from `1` to `2` so existing caches invalidate on first run after upgrade. Reproducer: `rm -f node_modules/.run402/assetMap.json && npm run build` then `jq '.assets[<key>] | {blurhash_data_url, asset_schema}' dist/_assets-manifest.json` populates both fields.

### Changed

- **`AssetRef` widened to mirror the current SDK shape.** Adds the v1.50 metadata + EXIF fields (`metadata`, `image_format`, `image_info`, `image_exif`, `image_exif_policy`) and v1.54 shape-contract fields (`blurhash_data_url`, `asset_schema`) the runtime already passed through. Plus the supporting `AssetMetadata` + `ExifPolicy` exports. Strictly additive — pre-existing consumers continue to type-check unchanged, but `as any` casts at field-access sites can now be removed.

### Internal

- New cache.ts header documents the AssetRef-field-add → cache-version-bump discipline that prevents future occurrences of this bug; `cache.test.ts` gains a v1 → v2 migration regression test and a v1.54-field roundtrip guard.

## 1.0.0-alpha.1 — unreleased

The agent-DX-locked default-export preset (Finding 5 in the design-review consultation). One-line `astro.config.mjs`:

```ts
import run402 from "@run402/astro";
export default run402();
```

returns a complete `AstroUserConfig` composing the image integration AND the SSR adapter. `output: 'server'` by default. Toggle either off via `images: false` / `ssr: false`. Compose alongside other integrations via `integrations: [...]`.

### Added

- **`run402` default export** — `(options?: Run402PresetOptions) => AstroUserConfig`. The agent-facing one-liner.
- **`run402Image`** — named export of just the image integration (the v0.2.x default behavior, renamed for clarity). Returns `AstroIntegration` for use in custom Astro configs.
- **`run402` named export aliased to `run402Image`** — v0.2.x users who wrote `import { run402 } from '@run402/astro'; integrations: [run402()]` continue to work unchanged.
- **`Run402PresetOptions`** type — extends `Run402AstroOptions` (the v0.2.x image options) with `output`, `integrations`, `site`, `images`, `ssr` controls for the preset.

### Migration from v0.2.x / v0.3.0-alpha

- **No code change required** if you used `import { run402 } from '@run402/astro'` — the named export `run402` is aliased to `run402Image` and still returns an `AstroIntegration`.
- **Recommended migration:** switch to the default export preset for one-line config:
  ```ts
  // Old (still works):
  import { run402 } from "@run402/astro";
  export default defineConfig({ integrations: [run402()] });

  // New (recommended):
  import run402 from "@run402/astro";
  export default run402();
  ```

## 0.3.0-alpha.1 — superseded by 1.0.0-alpha.1

Capability `astro-ssr-runtime` ([openspec change in run402-private](https://github.com/kychee-com/run402-private/tree/main/openspec/changes/astro-ssr-runtime)). Adds the SSR adapter primitives alongside the existing v0.2.x image integration. Additive — `integrations: [run402()]` users see zero breaking changes.

### Added

- **`createRun402Adapter(options?)` — Astro adapter factory.** New named export from `@run402/astro` (and via subpath `@run402/astro/ssr-adapter`). Returns an `AstroIntegration` that:
  - Registers itself as the deploy adapter via `setAdapter({ serverEntrypoint: '@run402/astro/runtime/server', ... })` in `astro:config:done`.
  - Configures the server build to land at `dist/run402/server/entry.mjs` (consumed by `run402 deploy`'s multi-slice ReleaseSpec emitter).
  - Runs build-time detectors for unsupported Astro features (dynamic `<Image>`, server islands, sessions API) at `astro:build:setup` and hard-fails with structured `R402_ASTRO_*` errors.
  - Emits `dist/run402/adapter.json` at `astro:build:done` — manifest the Run402 CLI reads to assemble the ReleaseSpec.
- **`detectDynamicImage`, `detectServerIslands`, `detectSessionsApi`** — build-time detector helpers, also exported from `@run402/astro/ssr-detectors`. Allow static-import `<Image src={hero}>` (where `hero` is an imported asset) while rejecting runtime `<Image src={page.heroUrl}>` (DB-sourced, function-call, env-var). Throw `Run402AstroDetectorError` with `code`, `message`, `suggestedFix`, `docs`, `file`, `line`.
- **`@run402/astro/runtime/server` — SSR Lambda entry shim.** The `serverEntrypoint` Astro's build wires to via `setAdapter`. Wraps `App.render(request)` in `runWithContext` (dynamically imported from optional peer dep `@run402/functions` — falls back to a no-op ALS scope when absent). Materializes the response body inside the ALS scope, flips `context.active.value = false` post-materialization, returns the user response alongside a `__r402_ssr_metadata` envelope (`{ cacheBypassTainted, runtimeError? }`) that the gateway reads to drive the ISR cache layer.
- **`<Run402Picture asset={AssetRef}>` component.** New subpath: `@run402/astro/components/Run402Picture.astro`. Renders a `<picture>` from a runtime-stored AssetRef (the typical Kychon CMS pattern: admin uploads via `assets.put()`, stores the returned AssetRef JSON in a DB column, page frontmatter fetches the row and passes `page.hero_asset` to the component). Emits WebP srcset (320w/800w/1920w) when variants are present; falls back to a safe single `<img>` from `display_url` / `cdn_url` / `variants.display_jpeg.cdn_url` (HEIC sources). Validates URL schemes against `javascript:` / `data:` / other unsafe schemes; emits runtime warning + drops the URL on detection. `priority` prop sets `fetchpriority="high"` + `loading="eager"` + `decoding="sync"`. `blurhash` data-attribute emitted when present (decoder ships in `@run402/astro/blurhash` for client-side hydration).
- **Optional peer dep `@run402/functions`** — required only when using `runtime/server` (the SSR adapter path); image-integration users don't need it.

### Subpath exports

- `@run402/astro/ssr-adapter` — `createRun402Adapter`, `Run402AdapterManifest`, `CreateRun402AdapterOptions`
- `@run402/astro/ssr-detectors` — `detectDynamicImage`, `detectServerIslands`, `detectSessionsApi`, `Run402AstroDetectorError`, `DetectorError`
- `@run402/astro/runtime/server` — `default` (the Lambda handler), `handler` (named alias)
- `@run402/astro/components/Run402Picture.astro` — the runtime picture component
- (unchanged) `.`, `./Image.astro`, `./manifest`, `./build-manifest`, `./blurhash`

### Roadmap

v1.0 will collapse this into a single default-exported `run402(options?): AstroUserConfig` factory so the agent-facing config is one line:

```ts
// astro.config.mjs (v1.0+)
import run402 from '@run402/astro';
export default run402();
```

v0.3.x ships the building blocks so adopters can start using SSR while the preset shape settles.

### Out of scope (deferred)

- v1.0 default-export preset shape (collapsing adapter + integration into one factory)
- Lambda response streaming through ECS Express (deferred to v1.5 — see `astro-ssr-runtime/specs/ssr-isr-cache/spec.md`)
- SWR via background revalidate (deferred to v1.5 — needs proper worker capture path)
- Runtime `/_image` endpoint (deferred — use the `<Run402Picture asset>` recipe for CMS images)

## 0.2.4 — 2026-05-19

(see git history for prior versions)
