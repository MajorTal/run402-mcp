# @run402/functions

> **Source moved.** This directory is a stub.
>
> The full source for `@run402/functions` now lives in the **private** gateway monorepo (`kychee-com/run402-private` at `packages/functions/`) so it can co-evolve with the gateway code that bundles it. The npm package on the registry is unchanged — same name, same exports, same types.

## Why

`@run402/functions` is **platform code, not a third-party library.** The gateway bundles it into every deployed function via esbuild at deploy time. When it lived here, a gateway-side endpoint change and the matching helper change had to span two repos, two CI runs, two version bumps. Drift was a real risk.

Colocating it with the gateway means:

- One CI run tests both the helper and the endpoint it calls.
- A single commit can change both atomically.
- Runtime fixes (wrong URLs, logic bugs) ship with a gateway redeploy — no `npm publish` required in the runtime path.

## For users

Nothing changes. Continue installing the package the same way:

```bash
npm install @run402/functions
```

Documentation and the user-facing API surface are unchanged. The npm page is at https://www.npmjs.com/package/@run402/functions.

## For platform maintainers

To change the `@run402/functions` surface, work in `kychee-com/run402-private` at `packages/functions/`. Publish via `/publish-functions` there.
