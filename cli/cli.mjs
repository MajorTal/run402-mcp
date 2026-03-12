#!/usr/bin/env node
/**
 * run402 — CLI for Run402
 * https://run402.com
 */

const [,, cmd, sub, ...rest] = process.argv;

const HELP = `run402 v1.0.0 — Full-stack backend infra for AI agents
https://run402.com

Usage:
  run402 <command> [subcommand] [options]

Commands:
  wallet    Manage your x402 wallet (create, fund, check status)
  projects  Manage deployed projects (list, query, inspect, renew, delete)
  deploy    Deploy a full-stack app or static site (Postgres + hosting)
  image     Generate AI images via x402 micropayments

Run 'run402 <command> --help' for detailed usage of each command.

Examples:
  run402 wallet create
  run402 wallet fund
  run402 deploy --tier prototype --manifest app.json
  run402 projects list
  run402 projects sql <project_id> "SELECT * FROM users LIMIT 5"
  run402 image generate "a startup mascot, pixel art" --output logo.png

Getting started:
  1. run402 wallet create    Create a local wallet
  2. run402 wallet fund      Fund it with test USDC (Base Sepolia faucet)
  3. run402 deploy ...       Deploy your app — payments handled automatically
`;

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(HELP);
  process.exit(cmd ? 0 : 0);
}

switch (cmd) {
  case "wallet": {
    const { run } = await import("./lib/wallet.mjs");
    await run(sub, rest);
    break;
  }
  case "projects": {
    const { run } = await import("./lib/projects.mjs");
    await run(sub, rest);
    break;
  }
  case "deploy": {
    const { run } = await import("./lib/deploy.mjs");
    await run([sub, ...rest].filter(Boolean));
    break;
  }
  case "image": {
    const { run } = await import("./lib/image.mjs");
    await run(sub, rest);
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    process.exit(1);
}
