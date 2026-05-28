## Why

The `cli-drop-status-envelope` change (v2.16.0) established the JSON-only stdout contract by dropping the `{ status: "ok", ...payload }` wrapper. A subsequent audit (May 2026, captured in this session) found that ~10 CLI subcommands still violated the spirit of "agent-first JSON-only" — either by defaulting to human text with a `--json` opt-in, by writing raw binary or content-dependent text directly to stdout, or by misnaming a streaming flag. Those gaps shipped as breaking-shape fixes in v2.23.0 and v2.24.0 (pre-launch, no users); this change archives the cumulative tightening so the canonical spec at `openspec/specs/cli-output-shape/spec.md` matches what's shipping.

## What Changes

- **BREAKING** `run402 functions invoke` always wraps the SDK invoke result on stdout as `{ http_status, body, duration_ms }`. The HTTP status is exposed as `http_status` (not `status`) so the payload stays clean of the reserved top-level `status` sentinel used in the stderr error envelope. A `--raw` flag opts back into verbatim body passthrough (string body → text + trailing newline, JSON body → pretty JSON) for the rare CSV/binary-blob piping case.
- **BREAKING** `run402 functions logs --follow` emits NDJSON — one JSON log entry per line, no `[ts] message` text formatting and no wrapping envelope. The non-follow batch path still emits a single `{ logs: [...] }` JSON object (unchanged).
- **BREAKING** `run402 email get-raw` requires `--output <file>`. Omitting `--output` is now `BAD_USAGE` with `details.flag: "--output"`. Stdout is a JSON envelope `{ message_id, bytes, output }`; raw MIME bytes never reach stdout.
- **BREAKING** `run402 assets put` flag `--json` renamed to `--stream` to reflect that it controls per-file NDJSON streaming, not "use JSON" (both shapes were already JSON). `--json` remains accepted as a deprecated alias that prints a one-line warning to stderr; scheduled for removal in a future major.
- **BREAKING** Six commands flip JSON-by-default and drop their `--json` opt-in flag: `cache inspect`, `cache invalidate`, `doctor`, `init` (default rail setup), `init astro`, `logs --request-id`. Passing `--json` to `cache inspect` / `cache invalidate` is now `UNKNOWN_FLAG`; on the other four the flag is silently absent from arg parsing (their HELP no longer documents it).
- **NEW** Long-running interactive setup commands (`init`, `init astro`) route their informational progress lines to stderr so a human re-running the command interactively still sees what's happening while a script piping stdout to jq stays clean.
- **NEW** The drift-protection test `cli-output-contract.test.mjs` is augmented in `cli-argv.test.mjs` with a per-command suite ("CLI JSON-only output contract (v3.x cleanup)") pinning every new shape — invoke envelope, logs --follow NDJSON, get-raw required --output, assets-put deprecated --json, cache inspect/invalidate UNKNOWN_FLAG, init/init-astro stdout-JSON + stderr-progress split, doctor `{ ok, checks }` shape, init-astro scaffold-template absence of the retired `getUser` import.

## Capabilities

### New Capabilities

(none — this change extends an existing capability)

### Modified Capabilities

- `cli-output-shape`: adds four new requirements to the existing capability spec — JSON-by-default applies universally (no per-command `--json` opt-in); function-invoke results expose HTTP status as `http_status` not `status`; follow-mode streaming uses NDJSON not text lines; binary/raw output requires explicit caller flag (`--output <file>` for `email get-raw`, `--raw` for `functions invoke`). Reaffirms the existing plain-text carve-out for `allowance export` and `dev`; adds `init` and `init astro` as carve-outs for "informational progress on stderr while stdout stays JSON-clean."

## Impact

- **Affected code:** `cli/lib/functions.mjs`, `cli/lib/email.mjs`, `cli/lib/assets.mjs`, `cli/lib/cache.mjs`, `cli/lib/doctor.mjs`, `cli/lib/init.mjs`, `cli/lib/init-astro.mjs`, `cli/lib/logs.mjs`. No SDK changes; no MCP changes.
- **Affected docs:** `cli/llms-cli.txt` (per-command reference flags + output-shape descriptions), `README.md` (in-function example snippets migrated to v3.0 `auth.*`), `sdk/llms-sdk.txt` (function-helpers reference entries + paragraph on gate-injected headers). The v2 → v3 README snippet migration was forced by the `@run402/functions@3.0.0` resolution required to align the publish-time lockfile with `@run402/astro@2.0.0`'s peer dep.
- **Affected tests:** new `cli-argv.test.mjs` suite "CLI JSON-only output contract (v3.x cleanup)" with 13 assertions; two existing `cli-e2e.test.mjs` tests updated to drop the explicit `--json` flag now that JSON is the default (GH-32, GH-81).
- **Affected dependencies:** root `package.json` `devDependencies."@run402/functions"` bumped from `^2.7.0` to `^3.0.0` — types/autocomplete only, no runtime imports in this repo.
- **Affected releases:** shipped as `run402-mcp` / `run402` / `@run402/sdk` v2.23.0 and v2.24.0 (lockstep). Pre-launch — no consumers — no migration path documented.
- **Affected scaffolds:** `run402 init astro` template `src/pages/[slug].astro` no longer imports the retired `getUser` bare export from `@run402/functions`; under v3.0+ that import would throw `R402_AUTH_UNKNOWN_EXPORT` at runtime, so freshly-scaffolded projects were broken on first run before this fix.
