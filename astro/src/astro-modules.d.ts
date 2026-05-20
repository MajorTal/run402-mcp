/**
 * Ambient declaration so `.astro` re-exports type-check under tsc.
 *
 * Astro's own SFC tooling provides richer types when the consumer has
 * `astro/client` in their tsconfig types — this declaration is just for
 * THIS package's build, where tsc needs to know that `./Image.astro`
 * has a default export of unknown shape. The actual runtime export is
 * an Astro component (a function the Astro compiler emits); we don't
 * need to type its props here because the consumer-facing types live
 * in `src/types.ts` (`ImageProps`).
 */

declare module "*.astro" {
  const Component: unknown;
  export default Component;
}
