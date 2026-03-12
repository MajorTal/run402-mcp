# run402-mcp

Developer tools for [Run402](https://run402.com) — provision Postgres databases, deploy static sites, generate images, and manage x402 wallets. Available as an MCP server, an OpenClaw skill, and a CLI.

English | [简体中文](./README.zh-CN.md)

## Integrations

| Interface | Use when... |
|-----------|-------------|
| [`cli/`](./cli/) | Terminal, scripts, CI/CD |
| [`openclaw/`](./openclaw/) | OpenClaw agent (no MCP required) |
| MCP server (this package) | Claude Desktop, Cursor, Cline, Claude Code |

## Quick Start

```bash
npx run402-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `provision_postgres_project` | Provision a new Postgres database (prototype/hobby/team tier) |
| `run_sql` | Execute SQL (DDL or queries) against a project |
| `rest_query` | Query/mutate data via PostgREST REST API |
| `upload_file` | Upload text content to project storage |
| `renew_project` | Renew a project's database lease |

## Client Configuration

### CLI

A standalone CLI is available in the [`cli/`](./cli/) directory.

```bash
npm install -g run402-cli

run402 wallet create
run402 wallet fund
run402 deploy --tier prototype --manifest app.json
```

See [`cli/README.md`](./cli/README.md) for full usage.

### OpenClaw

A standalone skill is available in the [`openclaw/`](./openclaw/) directory — no MCP server required. It calls the Run402 API directly via Node.js scripts.

```bash
cp -r openclaw ~/.openclaw/skills/run402
cd ~/.openclaw/skills/run402/scripts && npm install
```

See [`openclaw/README.md`](./openclaw/README.md) for details.

### MCP Clients

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "run402": {
      "command": "npx",
      "args": ["-y", "run402-mcp"]
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "run402": {
      "command": "npx",
      "args": ["-y", "run402-mcp"]
    }
  }
}
```

#### Cline

Add to Cline MCP settings:

```json
{
  "mcpServers": {
    "run402": {
      "command": "npx",
      "args": ["-y", "run402-mcp"]
    }
  }
}
```

#### Claude Code

```bash
claude mcp add run402 -- npx -y run402-mcp
```

## How It Works

1. **Provision** — Call `provision_postgres_project` to create a database. The server handles x402 payment negotiation and stores credentials locally.
2. **Build** — Use `run_sql` to create tables, `rest_query` to insert/query data, and `upload_file` for storage.
3. **Renew** — Call `renew_project` before your lease expires.

### Payment Flow

Provisioning and renewing require x402 micropayments. When payment is needed, tools return payment details (not errors) so the LLM can reason about them and guide the user through payment.

### Key Storage

Project credentials are saved to `~/.config/run402/projects.json` with `0600` permissions. Each project stores:
- `anon_key` — for public-facing queries (respects RLS)
- `service_key` — for admin operations (bypasses RLS)
- `tier` — prototype, hobby, or team
- `expires_at` — lease expiration timestamp

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RUN402_API_BASE` | `https://api.run402.com` | API base URL |
| `RUN402_CONFIG_DIR` | `~/.config/run402` | Config directory for key storage |

## Development

```bash
npm run build
npm run test:skill
```

## License

MIT
