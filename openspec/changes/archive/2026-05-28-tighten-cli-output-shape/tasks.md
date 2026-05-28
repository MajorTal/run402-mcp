## 1. Bucket A — mixed / content-dependent stdout shapes (shipped v2.23.0)

- [x] 1.1 `functions invoke`: wrap SDK invoke result as `{ http_status, body, duration_ms }`; rename top-level `status` → `http_status` to avoid the reserved sentinel collision. (`cli/lib/functions.mjs`)
- [x] 1.2 `functions invoke`: add `--raw` flag for verbatim body passthrough (string → text + newline; object → pretty JSON). Update HELP and SUB_HELP. (`cli/lib/functions.mjs`)
- [x] 1.3 `functions logs --follow`: replace `[ts] message` text formatting with one NDJSON line per `FunctionLogEntry`. Non-follow batch path keeps `{ logs: [...] }` envelope. (`cli/lib/functions.mjs`)
- [x] 1.4 `email get-raw`: require `--output <file>`; reject with `BAD_USAGE` + `details.flag: "--output"` when omitted; emit JSON envelope `{ message_id, bytes, output }` on stdout. Binary MIME bytes never reach stdout. Update HELP and SUB_HELP. (`cli/lib/email.mjs`)

## 2. Bucket C — streaming-flag rename (shipped v2.23.0)

- [x] 2.1 `assets put`: add `--stream` flag; keep `--json` as deprecated alias that prints a one-line warning to stderr; both route through identical streaming code path. Rename `opts.json` → `opts.stream` in the parser. Update HELP and SUB_HELP. (`cli/lib/assets.mjs`)

## 3. Bucket B — JSON-by-default flip (shipped v2.24.0)

- [x] 3.1 `cache inspect`: remove `--json` from `assertKnownFlags`; drop the text branch and `formatInspectResult` helper; always emit JSON. Update HELP. (`cli/lib/cache.mjs`)
- [x] 3.2 `cache invalidate`: remove `--json` from `assertKnownFlags`; drop the text branch and the multi-mode `emit` helper; always emit JSON. Update HELP. (`cli/lib/cache.mjs`)
- [x] 3.3 `doctor`: drop the `--json` check from arg parsing; remove the checkmark/icon report branch; always emit `{ ok, checks }`. Update HELP. (`cli/lib/doctor.mjs`)
- [x] 3.4 `init`: drop `--json` detection; route all `write` calls to stderr unconditionally; always emit JSON summary on stdout. Update HELP. (`cli/lib/init.mjs`)
- [x] 3.5 `init astro`: drop `--json` detection; route `Scaffolded ... / Files created: / Next steps:` to stderr; always emit JSON summary on stdout. Update HELP. (`cli/lib/init-astro.mjs`)
- [x] 3.6 `logs --request-id`: drop `--json` detection; drop the `[ts] [fn] msg` aggregator text branch; always emit JSON envelope. Update HELP. (`cli/lib/logs.mjs`)

## 4. Pre-existing bugs surfaced and fixed in v2.24.0

- [x] 4.1 `init astro` scaffold template: remove dead `getUser` and `cache` imports from `src/pages/[slug].astro` (the body never used them; under `@run402/functions@3.0+` the `getUser` bare export throws `R402_AUTH_UNKNOWN_EXPORT` at runtime). (`cli/lib/init-astro.mjs`)
- [x] 4.2 `logs.mjs` aggregator: unwrap `.logs` from `sdk.functions.logs` result (was leaking `{logs:[...]}` wrapper into the emitted JSON's `entries[i]`); fix timestamp sort to read `e.timestamp` (ISO string) instead of `e.ts` (a key that doesn't exist). (`cli/lib/logs.mjs`)

## 5. Doc updates (cumulative v2.23 + v2.24)

- [x] 5.1 `cli/llms-cli.txt`: per-command reference for each of the 10 affected subcommands — drop `--json` flag mentions, add new stdout-shape descriptions, document `--raw` opt-out on `functions invoke`, document `--stream` on `assets put` with `--json`-deprecated note, document NDJSON for `functions logs --follow`.
- [x] 5.2 `README.md`: migrate the two in-function example snippets from v2.x `getUser` to v3.0 `auth.requireUser` / `Actor.id`; drop the redundant `.eq("user_id", user.id)` filter (RLS already binds via `run402.current_user_id()`; the filter is a deploy-fail `R402_AUTH_REDUNDANT_USER_FILTER` under v3.0+).
- [x] 5.3 `sdk/llms-sdk.txt`: migrate the function-helpers section example snippet to v3.0 `auth.*`; rewrite the gate-injected-headers paragraph to show `req.headers.get(...)` direct read (since v3.0 retired `getUserId`/`getRole` bare exports); replace the two reference entries for the retired bare exports with `auth.user()` + the headers-read pattern.
- [x] 5.4 Root `package.json`: bump `devDependencies."@run402/functions"` from `^2.7.0` → `^3.0.0` to align with the existing `@run402/astro@2.0.0` peer dep so the publish-time lockfile-sync resolves cleanly. No runtime imports in this repo; types-only.

## 6. Tests (cumulative v2.23 + v2.24)

- [x] 6.1 Add `cli-argv.test.mjs` suite "CLI JSON-only output contract (v3.x cleanup)" with assertions for: `functions invoke` default envelope shape; `functions invoke --raw` body passthrough; `functions logs --follow` NDJSON; `email get-raw` requires `--output`; `email get-raw` success envelope; `assets put --json` deprecation warning + stream behavior; `assets put --stream` no warning; `cache inspect --json` rejected as `UNKNOWN_FLAG`; `cache invalidate --json` rejected as `UNKNOWN_FLAG`; `logs` default JSON envelope; `init` JSON-stdout + stderr-progress; `init astro` JSON-stdout + stderr-progress + scaffold-template absence of `getUser`; `doctor` `{ ok, checks }` shape.
- [x] 6.2 Update existing `cli-e2e.test.mjs` tests at GH-32 (`init --json emits JSON on stdout and human lines on stderr`) and GH-81 (`init mpp --json reports funded=true after faucet settles`) to drop the explicit `--json` flag now that JSON is the default.
- [x] 6.3 Verify the existing drift-protection test `cli-output-contract.test.mjs` continues to pass (it checks for top-level `status` string literals; the new `http_status` rename keeps the rule satisfied).

## 7. Release engineering (shipped)

- [x] 7.1 Lockstep publish v2.23.0 (`run402-mcp` + `run402` + `@run402/sdk`) via `.github/workflows/publish.yml`. Rewrite auto-generated release notes with the breaking-shape compat-check checklist. Smoke-test installed CLI.
- [x] 7.2 Lockstep publish v2.24.0 via same workflow. Rewrite release notes. Smoke-test `run402 doctor --no-scan` to confirm `{ ok, checks }` JSON shape.
- [x] 7.3 Verify SLSA provenance attestations on all 6 published artifacts (3 packages × 2 versions).
- [x] 7.4 (Out-of-band) Trigger private-repo `deploy-site.yml` workflow to push fresh `cli/llms-cli.txt` and `sdk/llms-sdk.txt` to run402.com.

## 8. Archive

- [x] 8.1 Run `/openspec-archive-change tighten-cli-output-shape` to merge the spec deltas into `openspec/specs/cli-output-shape/spec.md` and move the change directory to `openspec/changes/archive/`.
