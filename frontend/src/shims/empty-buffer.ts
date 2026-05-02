/**
 * Empty shim for the bare `buffer/` module specifier that plotly.js (or
 * one of its transitive deps) emits as a side-effect import. The browser
 * has no Node `Buffer`, and plotly's actual code path that needs Buffer
 * is server-only — but the import survives tree-shaking because it's a
 * side-effect statement.
 *
 * Aliasing `buffer/` to this file makes the import a no-op at runtime:
 * the browser receives an empty module, the side effect resolves, and
 * the rest of the bundle continues. We intentionally do NOT polyfill
 * the full Buffer API because nothing on the runtime path uses it; if
 * that changes we'll switch to `buffer` (the npm shim package) here.
 *
 * Audit incident: 2026-05-02 — production frontend went black-screen
 * because esbuild emitted `import "buffer/"` in the chunk containing
 * plotly, and the browser refused with "Failed to resolve module
 * specifier 'buffer/'. Relative references must start with either
 * '/', './', or '../'.". The empty shim restores the bundle.
 */

export {};
