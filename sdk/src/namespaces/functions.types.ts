/**
 * Request and response types for the `functions` namespace.
 * Maps to `/projects/v1/admin/:id/functions*` and `/functions/v1/:name`.
 */

export interface FunctionConfig {
  /** Timeout in seconds. Tier limits apply. */
  timeout?: number;
  /** Memory in MB. Tier limits apply. */
  memory?: number;
}

export interface FunctionDeployOptions {
  /** Function name — URL-safe slug, used in the invoke path. */
  name: string;
  /** Source code. TypeScript or JavaScript. Must `export default async (req: Request) => Response`. */
  code: string;
  config?: FunctionConfig;
  /**
   * Additional npm packages to bundle with the function. Each entry is an
   * npm spec: a bare name (`"lodash"`) resolves to latest at deploy time;
   * a pinned spec (`"lodash@4.17.21"`) uses that exact version; a range
   * (`"date-fns@^3.0.0"`) is resolved by npm at deploy time.
   *
   * `@run402/functions` is auto-bundled and `run402-functions` is the
   * deprecated package name — both are rejected with HTTP 400. Native
   * binary modules (e.g. `sharp`, `canvas`) are rejected at install time.
   * Limits: max 30 entries, max 200 chars per spec.
   *
   * The actually-installed concrete versions land in
   * {@link FunctionDeployResult.deps_resolved}.
   */
  deps?: string[];
  /** Cron schedule (5-field). Omit to deploy without a schedule. */
  schedule?: string | null;
}

export interface FunctionDeployResult {
  name: string;
  url: string;
  status: string;
  runtime: string;
  timeout: number;
  memory: number;
  schedule?: string | null;
  created_at: string;
  /**
   * The version of `@run402/functions` bundled into the function at deploy
   * time. Set when the function is deployed under the bundling-at-deploy
   * regime (see the companion `drop-functions-layer-and-fix-deps` change).
   * `null` (or omitted) for functions deployed before that change shipped.
   */
  runtime_version?: string | null;
  /**
   * Resolved direct user dependency versions from `--deps`. Map of dep
   * name → actually-installed concrete version (NOT the user's spec
   * string). `{}` when the function was deployed with empty `--deps` under
   * the new regime; `null` (or omitted) for legacy functions.
   *
   * Direct dependencies only — transitive deps, integrity hashes, and
   * peer-dep relationships are NOT included. This is "resolved direct
   * dependency versions," not a lockfile.
   */
  deps_resolved?: Record<string, string> | null;
  /**
   * Non-fatal warnings surfaced during the deploy (e.g. bundle size
   * exceeded the 10 MB recommended threshold but stayed under the 25 MB
   * hard limit; esbuild emitted a warning about a non-literal dynamic
   * import). Sibling to the function record at the top level of the
   * response, NOT inside it. Omitted (or `[]`) when there are no
   * warnings.
   */
  warnings?: string[];
}

export interface FunctionInvokeOptions {
  /** HTTP method. Default `POST`. */
  method?: string;
  /** Request body. Sent as JSON when an object, as-is when a string. */
  body?: string | Record<string, unknown>;
  /** Extra headers to forward. */
  headers?: Record<string, string>;
}

export interface FunctionInvokeResult {
  status: number;
  /** Parsed JSON body if the response was JSON, otherwise the raw text. */
  body: unknown;
  /** Wall-clock duration in milliseconds. */
  duration_ms: number;
}

export interface FunctionLogEntry {
  timestamp: string;
  message: string;
  /** CloudWatch event id, when available. Useful for follow-mode dedupe. */
  event_id?: string;
  /** CloudWatch log stream name, when available. */
  log_stream_name?: string;
  /** CloudWatch ingestion timestamp as ISO 8601, when available. */
  ingestion_time?: string;
  /** Best-effort routed/function request id extracted from structured logs. */
  request_id?: string;
}

export interface FunctionLogsOptions {
  /** Number of log lines. Server clamps to 1000. Default 50. */
  tail?: number;
  /** Only return logs at or after this ISO 8601 timestamp or epoch ms. */
  since?: string;
  /** Only return logs correlated to this routed/function request id. */
  requestId?: string;
}

export interface FunctionLogsResult {
  logs: FunctionLogEntry[];
}

export interface FunctionScheduleMeta {
  last_run_at?: string;
  last_status?: number;
  next_run_at?: string;
  run_count?: number;
  last_error?: string | null;
}

export interface FunctionSummary {
  name: string;
  url: string;
  runtime: string;
  timeout: number;
  memory: number;
  schedule?: string | null;
  schedule_meta?: FunctionScheduleMeta | null;
  created_at: string;
  updated_at: string;
  /**
   * The version of `@run402/functions` bundled into the function at deploy
   * time. `null` for functions deployed before the bundling-at-deploy
   * regime (see the companion `drop-functions-layer-and-fix-deps` change).
   */
  runtime_version?: string | null;
  /**
   * Resolved direct user dependency versions from `--deps`. Map of dep
   * name → actually-installed concrete version. `{}` for empty-deps
   * deploys under the new regime; `null` for legacy functions.
   * Direct deps only, not a full lockfile.
   */
  deps_resolved?: Record<string, string> | null;
  /**
   * `true` when the deployed Lambda zip carries an older gateway entry
   * wrapper / bundled runtime than the gateway's current build — a plain
   * redeploy with unchanged source does NOT refresh it (apply's release
   * diff keys on the source `code_hash`, not the wrapper). Refresh with
   * `r.project(id).functions.rebuild(name)` / `run402 functions rebuild`.
   * Capability `function-runtime-rebuild` (gateway v1.69+). Omitted by
   * gateways that don't yet derive staleness on this surface.
   */
  runtime_stale?: boolean;
}

export interface FunctionListResult {
  functions: FunctionSummary[];
}

/**
 * Result of refreshing a single function onto the gateway's current entry
 * wrapper + bundled runtime via {@link Functions.rebuild}. The rebuild
 * re-bundles from the function's STORED source with dependencies pinned to
 * the recorded `deps_resolved` exact versions, so the only change is the
 * wrapper/runtime: `code_hash` is unchanged and no new release is created.
 */
export interface FunctionRebuildResult {
  name: string;
  /** Always `true` on this (success) shape; the batch result uses a union. */
  rebuilt: true;
  /** The function's build fingerprint before the rebuild. `null` for rows deployed before fingerprinting. */
  old_fingerprint: string | null;
  /** The gateway's current build fingerprint, now stamped on the function. */
  new_fingerprint: string;
  /** Bundled `@run402/functions` version before the rebuild. */
  runtime_version_before: string | null;
  /** Bundled `@run402/functions` version after the rebuild. */
  runtime_version_after: string | null;
  /** Unchanged by a rebuild (source is identical) — surfaced so callers can assert the wrapper-only guarantee. */
  code_hash: string;
}

/**
 * Per-function entry in a project-wide rebuild ({@link Functions.rebuildAll}).
 * Either the successful {@link FunctionRebuildResult} or a non-aborting
 * failure: a rebuild that fails (bundle error, upload error, or the
 * `CANNOT_REBUILD_UNLOCKED_DEPS` refusal for functions deployed before
 * dependency locking) leaves the old artifact intact and is reported here.
 */
export type FunctionRebuildBatchEntry =
  | FunctionRebuildResult
  | { name: string; rebuilt: false; code?: string; error: string };

/** Project-wide rebuild result from {@link Functions.rebuildAll}. */
export interface FunctionRebuildBatchResult {
  /** Number of functions that rebuilt successfully. */
  rebuilt_count: number;
  /** Total functions considered. */
  total: number;
  /** Per-function outcomes; failures never abort the batch. */
  results: FunctionRebuildBatchEntry[];
}

export interface DeleteFunctionResult {
  status: string;
  name: string;
}

export interface FunctionUpdateOptions {
  /** Pass `null` to remove an existing schedule. `undefined` leaves the schedule unchanged. */
  schedule?: string | null;
  timeout?: number;
  memory?: number;
}

export interface FunctionUpdateResult {
  name: string;
  runtime: string;
  timeout: number;
  memory: number;
  schedule: string | null;
  schedule_meta: Record<string, unknown> | null;
  updated_at: string;
  /** See `FunctionSummary.runtime_version`. */
  runtime_version?: string | null;
  /** See `FunctionSummary.deps_resolved`. */
  deps_resolved?: Record<string, string> | null;
}
