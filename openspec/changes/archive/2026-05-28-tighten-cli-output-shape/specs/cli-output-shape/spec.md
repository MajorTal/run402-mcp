## ADDED Requirements

### Requirement: JSON Output Is The Default; No --json Opt-In Flag

The CLI SHALL NOT gate JSON output behind a `--json` opt-in flag. Every subcommand's machine-readable output SHALL be the default behavior; no flag SHALL be required to receive parseable JSON on stdout.

Subcommands MAY accept output-modifying flags for specific shapes (`--raw` for verbatim body passthrough, `--stream` for NDJSON progress events, `--output <file>` for writing binary bytes to disk), but SHALL NOT use a `--json` flag whose effect is "switch to JSON output." The legacy `--json` flag is removed across the CLI; passing it where it once was accepted SHALL produce a structured `UNKNOWN_FLAG` error on stderr with non-zero exit, except where preserved as a deprecated alias with a stderr deprecation warning (the only case is `run402 assets put --json`, an alias for `--stream`).

#### Scenario: Doctor emits JSON by default

- **WHEN** a user runs `run402 doctor` with no flags
- **THEN** stdout SHALL be a single JSON object of shape `{ ok: boolean, checks: [{ name, status, value?, hint?, message? }] }`
- **AND** stdout SHALL NOT contain the legacy ✓/⚠/✗ checkmark text report
- **AND** exit code SHALL be 0 when `ok: true`, non-zero otherwise

#### Scenario: Cache inspect rejects legacy --json flag

- **WHEN** a user runs `run402 cache inspect https://example.com/ --json`
- **THEN** CLI SHALL exit non-zero
- **AND** stderr SHALL contain a structured error envelope with `code: "UNKNOWN_FLAG"` and `details.flag: "--json"`

#### Scenario: Logs --request-id emits JSON envelope by default

- **WHEN** a user runs `run402 logs --request-id req_abc123 --project prj_x`
- **THEN** stdout SHALL be JSON of shape `{ ok, request_id, project_id, scanned, entries, errors? }`
- **AND** stdout SHALL NOT contain `[ts] [fn] msg` text-formatted log lines
- **AND** stdout SHALL NOT contain a top-level `status` field

### Requirement: Function Invoke Result Uses http_status Not status

`run402 functions invoke` SHALL wrap the SDK invoke result on stdout in a JSON envelope where the HTTP status code is exposed as `http_status` (not `status`). This preserves the reserved top-level `status` sentinel for stderr error envelopes only.

Envelope shape: `{ http_status: number, body: unknown, duration_ms: number }`. A `--raw` flag opts back into verbatim body passthrough — string body → text + trailing newline; JSON body → pretty-printed JSON — for the rare CSV / binary-blob piping case. The default behavior SHALL be independent of the function's response content type: a function returning `Response.json(obj)` and a function returning `Response("text")` SHALL produce the same envelope shape on stdout, differing only in `body`.

#### Scenario: Function returns JSON body

- **WHEN** a user runs `run402 functions invoke prj_x hello` and the function returns `Response.json({ hello: "world" })`
- **THEN** stdout SHALL contain a JSON object with `http_status` (a number, typically 200), `body: { hello: "world" }`, and `duration_ms` (a number)
- **AND** stdout SHALL NOT contain a top-level `status` field

#### Scenario: Function returns plain-text body, --raw passthrough

- **WHEN** a user runs `run402 functions invoke prj_x csv --raw` and the function returns `Response("col1,col2\n1,2", { headers: { "Content-Type": "text/plain" } })`
- **THEN** stdout SHALL be the verbatim string `col1,col2\n1,2` followed by a trailing newline
- **AND** stdout SHALL NOT be wrapped in a JSON envelope

#### Scenario: Function returns plain-text body, no --raw

- **WHEN** a user runs `run402 functions invoke prj_x csv` (no `--raw`) and the function returns `Response("col1,col2", { headers: { "Content-Type": "text/plain" } })`
- **THEN** stdout SHALL be a JSON envelope with `http_status`, `body: "col1,col2"` (the string preserved as `body`), and `duration_ms`

### Requirement: Streaming Subcommands Emit NDJSON

CLI subcommands that stream incremental updates from a long-running operation SHALL emit one valid JSON object per line on stdout (NDJSON), with no wrapping envelope and no text-formatted lines.

Each line SHALL be independently parseable as a complete JSON object. Subcommands that BATCH results (non-streaming, single-shot) MAY use a single wrapping object on stdout instead — the NDJSON rule applies only to streaming modes that emit incremental progress.

#### Scenario: functions logs --follow emits NDJSON

- **WHEN** a user runs `run402 functions logs prj_x ssr --follow` and the server returns 3 log entries
- **THEN** stdout SHALL contain 3 separate newline-terminated lines
- **AND** each line SHALL independently parse as a JSON `FunctionLogEntry` object with at minimum `timestamp` and `message` fields
- **AND** stdout SHALL NOT contain `[timestamp] message` text-formatted lines
- **AND** stdout SHALL NOT contain a wrapping `{ logs: [...] }` envelope

#### Scenario: functions logs non-follow batches into a single object

- **WHEN** a user runs `run402 functions logs prj_x ssr --tail 50` (no `--follow`)
- **THEN** stdout SHALL contain a single JSON object `{ logs: [...] }`
- **AND** stdout SHALL NOT be NDJSON (batch mode keeps the wrapping envelope)

#### Scenario: assets put --stream emits per-file NDJSON

- **WHEN** a user runs `run402 assets put a.png b.png c.png --stream`
- **THEN** stdout SHALL contain one NDJSON line per per-file progress event (`start`, `done`)
- **AND** each line SHALL independently parse as a JSON object containing an `event` field

### Requirement: Binary Or Verbatim Output Requires Explicit Caller Flag

CLI subcommands that produce non-JSON bytes (binary, raw RFC-822 MIME, verbatim text body) SHALL NOT write those bytes to stdout by default. The caller SHALL be required to opt into raw output via an explicit flag — either by specifying an output file path (`--output <file>`) for binary content or by passing a `--raw` flag for verbatim body passthrough.

The default behavior SHALL emit a JSON envelope describing the operation (e.g. `{ message_id, bytes, output }` after writing to disk, or `{ http_status, body, duration_ms }` for a wrapped body). Stdout SHALL never produce content-dependent shapes that pipe consumers cannot predict in advance.

#### Scenario: email get-raw without --output errors before network

- **WHEN** a user runs `run402 email get-raw msg_abc` without `--output`
- **THEN** CLI SHALL exit non-zero with `code: "BAD_USAGE"` and `details.flag: "--output"`
- **AND** stdout SHALL be empty
- **AND** the CLI SHALL NOT make a network call

#### Scenario: email get-raw with --output writes to file, emits JSON on stdout

- **WHEN** a user runs `run402 email get-raw msg_abc --output /tmp/msg.eml`
- **THEN** raw RFC-822 bytes SHALL be written to `/tmp/msg.eml`
- **AND** stdout SHALL be a JSON envelope `{ message_id, bytes, output }`
- **AND** stdout SHALL NOT contain binary bytes

#### Scenario: functions invoke --raw streams string body verbatim

- **WHEN** a user runs `run402 functions invoke prj_x csv --raw` and the function returns a `text/plain` string body
- **THEN** stdout SHALL be the verbatim string followed by a trailing newline
- **AND** stdout SHALL NOT be JSON-wrapped

### Requirement: Long-Running Setup Commands Route Progress To Stderr

CLI subcommands whose primary purpose is long-running interactive setup or scaffolding — specifically `run402 init` and `run402 init astro` — SHALL emit a structured JSON summary on stdout and informational progress lines on stderr. Stdout SHALL remain JSON-parseable end-to-end so scripts piping to `jq` work without filtering; stderr SHALL carry the human-readable narration that lets a person re-running interactively see what's happening (faucet status, files being written, next-step suggestions).

This is distinct from the plain-text carve-out at Requirement "Plain-Text Output Commands Remain Plain Text" (which covers `run402 allowance export` and similar single-value commands whose natural output IS plain text). The setup commands have a structured payload AND informational narration; the narration moves to stderr so the structured payload on stdout stays clean.

The progress-on-stderr split SHALL NOT use the stderr error envelope format (no `status: "error"` sentinel) — progress lines are free-form human text, distinguishable from error envelopes by not starting with `{`.

#### Scenario: init emits JSON summary on stdout, progress on stderr

- **WHEN** a user runs `run402 init`
- **THEN** stdout SHALL be a JSON object of shape `{ config_dir, allowance, rail, network, balance, tier, projects_saved, next_step }`
- **AND** stderr SHALL contain human progress lines including labels such as `Config`, `Allowance`, `Balance`, `Tier`, `Next`
- **AND** stderr SHALL NOT contain a structured error envelope (no JSON object starting with `{ "status": "error"`)

#### Scenario: init astro emits JSON summary on stdout, scaffold narration on stderr

- **WHEN** a user runs `run402 init astro ./my-app`
- **THEN** stdout SHALL be a JSON object of shape `{ dir, files_created, created, next_steps }`
- **AND** stderr SHALL contain `Scaffolded Astro project at <dir>` and `Files created:` and `Next steps:` narration
- **AND** stdout SHALL NOT contain the scaffolded-file list as a text bullet list

#### Scenario: init astro scaffold template does not import retired getUser

- **WHEN** a user runs `run402 init astro ./my-app` and inspects `./my-app/src/pages/[slug].astro`
- **THEN** the scaffolded file SHALL NOT contain `getUser` (the retired bare export from `@run402/functions` v2.x that throws `R402_AUTH_UNKNOWN_EXPORT` at runtime under v3.0+)
- **AND** the scaffolded file SHALL import only the symbols it actually uses from `@run402/functions`
