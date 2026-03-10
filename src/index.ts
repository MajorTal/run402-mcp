#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Existing tools
import { provisionSchema, handleProvision } from "./tools/provision.js";
import { runSqlSchema, handleRunSql } from "./tools/run-sql.js";
import { restQuerySchema, handleRestQuery } from "./tools/rest-query.js";
import { uploadFileSchema, handleUploadFile } from "./tools/upload-file.js";
import { renewSchema, handleRenew } from "./tools/renew.js";
import { deploySiteSchema, handleDeploySite } from "./tools/deploy-site.js";
import { claimSubdomainSchema, handleClaimSubdomain } from "./tools/subdomain.js";
import { deleteSubdomainSchema, handleDeleteSubdomain } from "./tools/subdomain.js";
import { deployFunctionSchema, handleDeployFunction } from "./tools/deploy-function.js";
import { invokeFunctionSchema, handleInvokeFunction } from "./tools/invoke-function.js";
import { getFunctionLogsSchema, handleGetFunctionLogs } from "./tools/get-function-logs.js";
import { setSecretSchema, handleSetSecret } from "./tools/set-secret.js";

// New tools — database
import { setupRlsSchema, handleSetupRls } from "./tools/setup-rls.js";
import { getSchemaSchema, handleGetSchema } from "./tools/get-schema.js";
import { getUsageSchema, handleGetUsage } from "./tools/get-usage.js";

// New tools — bundle & marketplace
import { bundleDeploySchema, handleBundleDeploy } from "./tools/bundle-deploy.js";
import { browseAppsSchema, handleBrowseApps } from "./tools/browse-apps.js";
import { forkAppSchema, handleForkApp } from "./tools/fork-app.js";
import { getQuoteSchema, handleGetQuote } from "./tools/get-quote.js";
import { publishAppSchema, handlePublishApp } from "./tools/publish-app.js";
import { listVersionsSchema, handleListVersions } from "./tools/list-versions.js";

// New tools — storage CRUD
import { downloadFileSchema, handleDownloadFile } from "./tools/download-file.js";
import { deleteFileSchema, handleDeleteFile } from "./tools/delete-file.js";
import { listFilesSchema, handleListFiles } from "./tools/list-files.js";

// New tools — functions & secrets CRUD
import { listFunctionsSchema, handleListFunctions } from "./tools/list-functions.js";
import { deleteFunctionSchema, handleDeleteFunction } from "./tools/delete-function.js";
import { listSecretsSchema, handleListSecrets } from "./tools/list-secrets.js";
import { deleteSecretSchema, handleDeleteSecret } from "./tools/delete-secret.js";

// New tools — subdomains & projects
import { listSubdomainsSchema, handleListSubdomains } from "./tools/list-subdomains.js";
import { archiveProjectSchema, handleArchiveProject } from "./tools/archive-project.js";

// New tools — billing
import { checkBalanceSchema, handleCheckBalance } from "./tools/check-balance.js";
import { listProjectsSchema, handleListProjects } from "./tools/list-projects.js";

const server = new McpServer({
  name: "run402",
  version: "0.2.0",
});

// ─── Core database tools ────────────────────────────────────────────────────

server.tool(
  "provision_postgres_project",
  "Provision a new Postgres database. Returns project credentials on success, or payment details if x402 payment is needed.",
  provisionSchema,
  async (args) => handleProvision(args),
);

server.tool(
  "run_sql",
  "Execute SQL (DDL or queries) against a provisioned project. Returns results as a markdown table.",
  runSqlSchema,
  async (args) => handleRunSql(args),
);

server.tool(
  "rest_query",
  "Query or mutate data via the PostgREST REST API. Supports GET/POST/PATCH/DELETE with query params.",
  restQuerySchema,
  async (args) => handleRestQuery(args),
);

server.tool(
  "setup_rls",
  "Apply row-level security to tables. Templates: user_owns_rows (users access own rows only), public_read (anyone reads, authenticated writes), public_read_write (open access).",
  setupRlsSchema,
  async (args) => handleSetupRls(args),
);

server.tool(
  "get_schema",
  "Introspect the database schema — tables, columns, types, constraints, and RLS policies. Useful for understanding the database structure before writing queries.",
  getSchemaSchema,
  async (args) => handleGetSchema(args),
);

server.tool(
  "get_usage",
  "Get project usage report — API calls, storage usage, limits, and lease expiry.",
  getUsageSchema,
  async (args) => handleGetUsage(args),
);

// ─── Storage tools ──────────────────────────────────────────────────────────

server.tool(
  "upload_file",
  "Upload text content to project storage. Returns the storage key and size.",
  uploadFileSchema,
  async (args) => handleUploadFile(args),
);

server.tool(
  "download_file",
  "Download a file from project storage. Returns the file content.",
  downloadFileSchema,
  async (args) => handleDownloadFile(args),
);

server.tool(
  "delete_file",
  "Delete a file from project storage.",
  deleteFileSchema,
  async (args) => handleDeleteFile(args),
);

server.tool(
  "list_files",
  "List files in a storage bucket. Shows file names, sizes, and last modified dates.",
  listFilesSchema,
  async (args) => handleListFiles(args),
);

// ─── Functions tools ────────────────────────────────────────────────────────

server.tool(
  "deploy_function",
  "Deploy a serverless function (Node 22) to a project. Handler signature: export default async (req: Request) => Response. Pre-bundled packages: stripe, openai, @anthropic-ai/sdk, resend, zod, uuid, jsonwebtoken, bcryptjs, cheerio, csv-parse.",
  deployFunctionSchema,
  async (args) => handleDeployFunction(args),
);

server.tool(
  "invoke_function",
  "Invoke a deployed function via HTTP. Returns the function's response body and status code. Useful for testing functions without building a frontend.",
  invokeFunctionSchema,
  async (args) => handleInvokeFunction(args),
);

server.tool(
  "get_function_logs",
  "Get recent logs from a deployed function. Shows console.log/error output and error stack traces from CloudWatch.",
  getFunctionLogsSchema,
  async (args) => handleGetFunctionLogs(args),
);

server.tool(
  "list_functions",
  "List all deployed functions for a project. Shows names, URLs, runtime, timeout, and memory.",
  listFunctionsSchema,
  async (args) => handleListFunctions(args),
);

server.tool(
  "delete_function",
  "Delete a deployed function from a project.",
  deleteFunctionSchema,
  async (args) => handleDeleteFunction(args),
);

// ─── Secrets tools ──────────────────────────────────────────────────────────

server.tool(
  "set_secret",
  "Set a project secret (e.g. STRIPE_SECRET_KEY). Secrets are injected as process.env variables in functions. Setting an existing key overwrites it.",
  setSecretSchema,
  async (args) => handleSetSecret(args),
);

server.tool(
  "list_secrets",
  "List secret keys for a project (values are not shown). Useful for checking which secrets are configured.",
  listSecretsSchema,
  async (args) => handleListSecrets(args),
);

server.tool(
  "delete_secret",
  "Delete a secret from a project.",
  deleteSecretSchema,
  async (args) => handleDeleteSecret(args),
);

// ─── Deployment & subdomain tools ───────────────────────────────────────────

server.tool(
  "deploy_site",
  "Deploy a static site (HTML/CSS/JS). Files are uploaded to S3 and served via CloudFront at a unique URL. Costs $0.05 USDC via x402.",
  deploySiteSchema,
  async (args) => handleDeploySite(args),
);

server.tool(
  "claim_subdomain",
  "Claim a custom subdomain (e.g. myapp.run402.com) and point it at an existing deployment. Free, requires service_key auth.",
  claimSubdomainSchema,
  async (args) => handleClaimSubdomain(args),
);

server.tool(
  "delete_subdomain",
  "Release a custom subdomain. The URL will stop serving content.",
  deleteSubdomainSchema,
  async (args) => handleDeleteSubdomain(args),
);

server.tool(
  "list_subdomains",
  "List all subdomains claimed by a project.",
  listSubdomainsSchema,
  async (args) => handleListSubdomains(args),
);

// ─── Bundle deploy & marketplace tools ──────────────────────────────────────

server.tool(
  "bundle_deploy",
  "One-call full-stack app deployment. Provisions a database and optionally runs migrations, applies RLS, sets secrets, deploys functions, deploys a static site, and claims a subdomain — all in a single x402 payment.",
  bundleDeploySchema,
  async (args) => handleBundleDeploy(args),
);

server.tool(
  "browse_apps",
  "Browse public apps available for forking. Optionally filter by tags.",
  browseAppsSchema,
  async (args) => handleBrowseApps(args),
);

server.tool(
  "fork_app",
  "Fork a published app into a new project. Creates a full copy including database, functions, site, and optionally claims a subdomain.",
  forkAppSchema,
  async (args) => handleForkApp(args),
);

server.tool(
  "publish_app",
  "Publish a project as a forkable app. Set visibility and tags for discoverability.",
  publishAppSchema,
  async (args) => handlePublishApp(args),
);

server.tool(
  "list_versions",
  "List published versions of a project.",
  listVersionsSchema,
  async (args) => handleListVersions(args),
);

// ─── Project lifecycle tools ────────────────────────────────────────────────

server.tool(
  "get_quote",
  "Get tier pricing for Run402 projects. Free, no auth required. Shows prices, lease durations, storage limits, and API call limits.",
  getQuoteSchema,
  async (args) => handleGetQuote(args),
);

server.tool(
  "renew_project",
  "Renew a project's lease. Returns success or payment details if x402 payment is needed.",
  renewSchema,
  async (args) => handleRenew(args),
);

server.tool(
  "archive_project",
  "Archive a project and remove it from the local key store. This action cannot be undone.",
  archiveProjectSchema,
  async (args) => handleArchiveProject(args),
);

// ─── Billing & wallet tools ─────────────────────────────────────────────────

server.tool(
  "check_balance",
  "Check billing account balance for a wallet address. Shows available and held funds.",
  checkBalanceSchema,
  async (args) => handleCheckBalance(args),
);

server.tool(
  "list_projects",
  "List all active projects for a wallet address.",
  listProjectsSchema,
  async (args) => handleListProjects(args),
);

const transport = new StdioServerTransport();
await server.connect(transport);
