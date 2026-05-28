## Context

The `run402` CLI is documented as agent-first and machine-readable by design (the `cli-drop-status-envelope` change at v2.16.0 codified that). A May 2026 audit of the actual implementation found ~10 subcommands that violated the spirit of "JSON-only by default" in three distinct categories:

1. **Bucket A — Mixed/content-dependent shapes** (3 commands): `functions invoke` returned raw text on string body and JSON on object body; `email get-raw` wrote raw MIME bytes directly to stdout when `--output` was absent; `functions logs --follow` emitted `[ts] message` text lines while the non-follow batch path emitted JSON. Same command, different shapes — agents downstream had to defensively branch.
2. **Bucket B — Text-by-default with `--json` opt-in** (6 commands): `cache inspect`, `cache invalidate`, `doctor`, `init`, `init astro`, `logs --request-id`. Each command had a hand-tuned human report as default with `--json` as opt-in. Inverted from the documented contract; trip-wire for every agent integration.
3. **Bucket C — Misnamed streaming flag** (1 command): `assets put --json` named a flag "use JSON" when both shapes were already JSON — the flag actually toggled per-file NDJSON streaming. Internally inconsistent with the other commands' `--json` semantics.

All three buckets shipped fixes pre-launch (no users) in v2.23.0 and v2.24.0. This design document captures the technical decisions behind those fixes so the canonical spec at `openspec/specs/cli-output-shape/spec.md` reflects current behavior.

The audit also surfaced one capability gap and two pre-existing bugs that were fixed alongside:
- The `init` and `init astro` commands have legitimate human narration (faucet progress, scaffolded-file lists) — the audit forced a decision about where that goes when stdout is JSON-clean.
- The `cli/lib/logs.mjs` aggregator wasn't unwrapping the SDK's `{ logs: FunctionLogEntry[] }` result shape; the emitted JSON had `entries[i]` as the wrapper object. Same place: the timestamp sort read `e.ts` (a key that doesn't exist on `FunctionLogEntry`).
- The `cli/lib/init-astro.mjs` scaffold-template wrote `src/pages/[slug].astro` with `import { db, getUser, cache } from "@run402/functions"`. Under `@run402/functions@3.0+`, the `getUser` bare export throws `R402_AUTH_UNKNOWN_EXPORT` at runtime — meaning every freshly-scaffolded user's first request would have failed.

## Goals / Non-Goals

**Goals:**

- Make stdout 100% JSON-by-default across every `run402` subcommand (modulo the documented plain-text carve-out).
- Eliminate content-dependent stdout shapes — same command, same flags, same project SHALL produce the same stdout shape regardless of what data the server returned.
- Remove the `--json` opt-in flag from every command that had one; JSON is the default, not an opt-in.
- Preserve human re-runnability of long-running setup commands (`init`, `init astro`) — narration MUST stay visible somewhere, just not on stdout.
- Reuse the existing drift-protection test machinery so future contributors can't undo the cleanup silently.
- Treat this as pre-launch cleanup; no migration path, no deprecation window for the legacy `--json` flag (the one exception is `assets put --json` kept as a deprecated alias because its internal-consistency rename was less load-bearing).

**Non-Goals:**

- Adding a `--text` or `--pretty` opt-out flag for humans wanting the legacy banners. Humans can pipe to `jq` / `json_pp`. Adding an opt-out re-introduces the dual-shape problem we just removed.
- Changing the SDK or MCP surface. Both are unchanged in this cleanup; only the CLI's stdout-shape contract moved.
- Changing the stderr error envelope. The `status: "error"` sentinel on stderr is preserved (it's the inverse of the stdout rule, not an exception to it).
- Migrating consumers — there are none. Pre-launch.
- Backporting to a maintenance branch.

## Decisions

### D1. JSON-by-default is universal; the `--json` flag is removed, not silenced

**Decision:** Drop the `--json` flag entirely from `cache inspect`, `cache invalidate`, `doctor`, `init`, `init astro`, `logs`. Passing it where it once was accepted SHALL produce `UNKNOWN_FLAG` (for the cache commands) or be silently absent from arg parsing (for `init`/`init-astro`/`doctor`/`logs`, which use looser arg-parsing patterns).

**Alternatives considered:**
- *Silent no-op alias.* Accept `--json` but ignore it. Rejected because it leaves invisible cruft in the CLI surface and ambiguity for new contributors ("what does `--json` mean if it's the default?").
- *Deprecation warning alias* (the path `assets put --json` took). Rejected for these 6 because the audit established there are no users; the warning is wasted noise.

**Rationale:** Pre-launch is the cheapest moment in the CLI's lifetime to make this kind of breaking-shape change. The cost of doing it later compounds — every script that mentions `--json` becomes a documented "remove this flag" task. Removing now keeps the surface small.

### D2. Function-invoke envelope uses `http_status`, not `status`

**Decision:** `run402 functions invoke` emits `{ http_status: number, body: unknown, duration_ms: number }` on stdout. The HTTP status is renamed from the SDK's `status` field (which is `200` by default) to `http_status` to avoid colliding with the reserved top-level `status` sentinel used in the stderr error envelope.

**Alternatives considered:**
- *Keep `status` as a numeric field.* Rejected because the existing spec ("CLI Success Stdout Has No Top-Level Status Wrapper") forbids any top-level `status` field at the envelope level. A numeric value still violates the literal-text rule.
- *Move the SDK result inside a `result:` wrapper.* Rejected as one layer of indirection that callers would have to dereference; the flat `{ http_status, body, duration_ms }` shape is more direct.
- *Don't wrap; just emit `body` and let `http_status` / `duration_ms` go to stderr.* Rejected because both fields are genuinely useful — `http_status` lets callers distinguish 200 from 204 from 304 without parsing body content; `duration_ms` is useful for latency debugging.

**Rationale:** The rename costs one line in the CLI handler (`const { status, ...rest } = result; ... { http_status: status, ...rest }`) and removes the spec ambiguity. `http_status` is also more self-documenting than `status` — readers don't have to know whether it's the HTTP status, the function status, or the envelope sentinel.

### D3. `--raw` flag for the rare verbatim-body case

**Decision:** Add `--raw` to `functions invoke`. When passed, skip the envelope; string body → text + newline; object body → pretty-printed JSON. This is the opt-out path for callers piping CSV exports, binary blobs, or other content that should land verbatim in a file.

**Alternatives considered:**
- *No opt-out; always JSON-wrap.* Rejected because legitimate "I genuinely need the raw response" cases exist (CSV exports being the canonical example) and the workaround (parse JSON, extract `body`, write that) is awkward enough that callers would just stop using the CLI for those flows.
- *Auto-detect based on response content type.* Rejected because that re-creates the content-dependent shape problem — same command, two stdout shapes, dispatch determined by the server.

**Rationale:** `--raw` is opt-in, explicit, made by the caller up-front. Predictability of stdout shape is preserved; the verbatim case stays accessible.

### D4. NDJSON for streaming; single envelope for batched

**Decision:** Streaming subcommands (`functions logs --follow`, `assets put --stream`) emit one JSON object per line (NDJSON). Batched subcommands (`functions logs` without `--follow`, `assets ls`, etc.) emit a single wrapping object.

**Alternatives considered:**
- *JSON Lines wrapped in a top-level array literal.* Rejected because shell consumers reading a stream don't see the closing `]` until the stream ends; they can't process incrementally.
- *Server-sent events (SSE) style with `data:` prefix.* Rejected as needless ceremony for CLI consumption.

**Rationale:** NDJSON is the agreed convention for line-streamed JSON. `jq -c '.message'` and `while read line; do echo "$line" | jq ...; done` both work without buffering tricks.

### D5. Binary/raw output requires explicit flag

**Decision:** `email get-raw` requires `--output <file>`; omitting `--output` is a `BAD_USAGE` error before any network call. Stdout on success is a JSON envelope `{ message_id, bytes, output }`. Binary MIME bytes never reach stdout.

**Alternatives considered:**
- *Auto-detect content type and emit JSON wrapper for text/MIME but raw bytes for binary.* Rejected as content-dependent stdout (same problem class as the bucket-A defects we're fixing).
- *Stream binary on stdout unconditionally.* Rejected because the entire point of "JSON-by-default" is that pipes don't choke. Binary bytes break `jq`, break terminal display, break `tee`.

**Rationale:** The caller knows up-front whether they want the bytes; making them pass `--output <file>` makes that intent explicit and keeps stdout clean.

### D6. Long-running setup commands narrate on stderr

**Decision:** `init` and `init astro` emit a structured JSON summary on stdout AND human progress lines on stderr. The two streams are independent — a script can pipe stdout to `jq` and let stderr render in the terminal.

**Alternatives considered:**
- *Strip narration entirely; humans can read the JSON.* Rejected because faucet polling can take 30+ seconds; without progress, a human re-running interactively has no signal that anything is happening.
- *Add a `--text` flag for the human-friendly mode.* Rejected (see Non-Goals) — it re-introduces dual-shape stdout.
- *Put progress on stdout as JSON events too (NDJSON-style).* Rejected because the final summary is the load-bearing structured payload; agents want exactly one object on stdout, not N events plus a summary.

**Rationale:** Stderr is the conventional "informational not-stdout" channel. Progress lines on stderr is what every long-running command in the Unix tradition does (`git push`, `tar`, `rsync`, `curl --progress`). The CLI follows the same convention.

### D7. `assets put --json` kept as deprecated alias

**Decision:** Unlike the other five `--json` flags, `run402 assets put --json` is preserved as a deprecated alias for `--stream`. Calling it prints a one-line warning to stderr and otherwise behaves identically to `--stream`. Scheduled for removal in a future major.

**Alternatives considered:**
- *Remove `--json` like the others.* Considered but rejected for `assets put` specifically because the rename is internal-consistency (both flag names triggered JSON output; only the streaming-vs-batch semantics differ). Users who happen to know the old name see a clear migration message and the behavior is identical.
- *Treat as truly silent no-op.* Rejected because the rename has a specific reason (clarifying that the flag controls streaming, not JSON-ness) and the user deserves a one-line explanation rather than discovering by reading the changelog.

**Rationale:** Asymmetry with the other five `--json` removals is justified because the semantics genuinely differ — `assets put --json` was already JSON by default, the flag was just misnamed. A renamed-alias-with-warning is the minimum-disruption path.

### D8. `--no-scan` and other doctor flags preserved

**Decision:** Doctor's `--verbose`, `--no-scan`, `--scan-dir <D>` flags are all preserved. Only `--json` is removed.

**Alternatives considered:**
- *Wholesale arg-parser rewrite while we're here.* Rejected as scope creep — those flags work and have callers.

**Rationale:** Stay focused on the output-shape contract. Argv-parser hygiene is a separate concern.

## Risks / Trade-offs

- **Risk: humans running interactively see less-readable output.** Mitigation: `init` and `init astro` keep narration on stderr, which is what most terminal emulators interleave with stdout by default. `doctor` and `cache` lose their decorated formatting, but those commands are short and the JSON is pretty-printed. The user can `| jq` for color if they want.
- **Risk: drift between specs and code.** Mitigation: the existing `cli-output-contract.test.mjs` static-scan continues to catch the most insidious regression (top-level `status` sentinel wrapper). Added: a per-command suite in `cli-argv.test.mjs` ("CLI JSON-only output contract (v3.x cleanup)") with 13 assertions pinning the new shapes. Future contributors flipping a default back to text will trip these tests.
- **Risk: the `--raw` flag becomes a vector for shape-variance regression.** Mitigation: the test suite includes a `--raw` scenario for `functions invoke` that asserts exact output bytes; any change to the verbatim path is visible in the diff.
- **Risk: the kept `assets put --json` alias drifts in semantics from `--stream` over time.** Mitigation: the alias is a single `out.stream = true` branch in the parser; both flags route through identical code paths. Removal is scheduled for the next major version, at which point the alias is gone and the risk evaporates.
- **Trade-off: pre-launch breaking changes shipped as minor versions.** Justified by the agent-first CLI contract documenting machine-readable output as the API surface, with no consumers to migrate. Recorded in the CHANGELOG for transparency.

## Migration Plan

This change archives behavior already shipped in `run402-mcp` / `run402` / `@run402/sdk` v2.23.0 and v2.24.0. No migration is required:

- **For consumers:** none exist (pre-launch).
- **For internal tooling / SDK / MCP:** no SDK or MCP code changed. The CLI's stdout-shape contract moved; agents reading per-command JSON pick up the new shapes automatically because both versions were JSON.
- **For docs:** `cli/llms-cli.txt` per-command reference, `README.md` in-function examples, and `sdk/llms-sdk.txt` function-helpers section all updated in the same commits. The private-repo `run402.com` site auto-pulls these at deploy time.

Rollback: revert the commits and re-publish a patch. No data-plane impact; no schema migration.

## Open Questions

- **Should `cache invalidate --prefix` and `--all` accept a `--quiet` flag** to suppress the JSON output for fire-and-forget mass invalidations from CI? Not a current need; defer until requested.
- **Should `doctor` exit code communicate per-category failure** (e.g., 2 = source-scan errors blocking deploy, 1 = config gaps)? Currently binary (0/1); the per-check `status` strings in the JSON payload convey severity. Defer until an agent integration shows the need.
- **Should `init` accept `--quiet` to suppress stderr progress** for CI logs? Not a current need; if added later, it should NOT change stdout behavior.
