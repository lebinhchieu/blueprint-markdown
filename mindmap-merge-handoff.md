# Mindmap directive — session handoff

Status: **merge into the extension is complete and verified.** Nothing left to implement.
Not committed yet (per policy: never auto-commit) — ask the user before committing.

## What this covers

The `:::mindmap` directive (design doc: `mindmap-design.md`) went through four phases:

1. Standalone Cytoscape.js viewer prototype (`mindmap-viewer/`) — committed as `b98f0d9 Mindmap MVP`.
2. All deferred/v2 features (hover isolation, animated cross-links, focus-lock, concentric
   layout, collapse/expand) — committed as `7356432 Mindmap phase 2`.
3. Bug fixes: concentric layout spacing, virtual root node only when >1 top-level heading.
4. **Merge into the real extension** — this session's work, described below. Uncommitted.

## Files changed in the merge (phase 4)

New:
- `src/core/directives/mindmap.ts` — registers `:::mindmap` as a container directive.
  Parses body via `parseMindmap()`, server-renders an **empty placeholder**
  (`<div class="em-mindmap" data-graph="...">`), same pattern as mermaid fences.

Modified:
- `src/core/directives/index.ts` — registers `mindmapDirectives`.
- `src/core/mindmap/mountMindmap.ts` — refactored to take `cytoscape`/`cytoscape-dagre` as
  **injected parameters** instead of static imports (`CytoscapeLib`/`CytoscapeDagreLib` type
  aliases), so neither library is statically bundled into `extension.js`/`export-client.js`.
- `src/core/markdownitBrowser.ts` — added `createMinimalMarkdownIt()` (skips
  `installFenceRenderer`/highlight.js) for the mindmap detail drawer.
- `src/core/previewRuntime.ts` — new `mountMindmaps()`, called from `runShared()`. Keeps live
  Cytoscape instances in a `WeakMap<HTMLElement, …>` keyed by the placeholder element so VS
  Code's morphdom (which wipes the empty placeholder's children on every edit) doesn't lose
  pan/zoom/collapse/drawer state — re-appends the still-live canvas/drawer nodes when
  `data-graph` is unchanged instead of rebuilding.
- `src/preview.ts` — bundles `cytoscape`/`cytoscape-dagre` statically, passes them to
  `runShared`.
- `src/exportClient.ts` — passes `window.cytoscape`/`window.cytoscapeDagre` (CDN-loaded).
- `src/export/exportHtml.ts` — injects cytoscape + cytoscape-dagre CDN `<script>` tags only
  when the exported doc actually contains a rendered `.em-mindmap` block (mirrors the
  existing mermaid CDN-injection pattern).
- `mindmap-viewer/main.ts` — updated for `mountMindmap`'s new signature (now takes injected
  `cytoscape`/`cytoscapeDagre`); switched to `createMinimalMarkdownIt` for parity with what
  ships in the real extension.

Docs:
- `skills/blueprint-markdown/SKILL.md` — added mindmap to the trigger list, the catalog, and
  the silent-failure traps table (`:::mindmap` body is headings, not nested directives).
- `skills/blueprint-markdown/references/syntax.md` — full `:::mindmap` attribute/type/color
  reference.
- `skills/blueprint-markdown/validate.mjs` — registered `mindmap: ['container']`.
- `skills/blueprint-markdown/assets/sample.md` — added a mindmap example section.
- `README.md`, `CLAUDE.md` (project root) — component table + architecture notes on the
  "client-rendered directive" pattern (mermaid + mindmap).

## Key design decisions (in case picked up cold)

- **Heavy-library-as-injected-parameter pattern**: `previewRuntime.ts` never imports
  cytoscape directly — this mirrors the pre-existing `MermaidApi` pattern and is what keeps
  `dist/export-client.js` small.
- **Morphdom survival**: solved via `WeakMap` keyed by the placeholder DOM element (verified
  empirically that the same element instance survives a morphdom wipe — only its children
  are removed).
- **Cytoscape API footgun** (documented in `mountMindmap.ts` comments): `predecessors()` /
  `successors()` / `incomers()` / `outgoers()` traverse ALL edges regardless of the selector
  argument, filtering only the final result — a node never matches an edge selector, so
  filtering strips out all nodes too. Worked around with manual one-hop + loop traversal
  (`treeParent()`).
- **Bundle-size regression caught and fixed**: routing the mindmap drawer's markdown through
  the normal `createBrowserMarkdownIt()` pulled all of highlight.js into
  `export-client.js` (1.2MB). `createMinimalMarkdownIt()` fixed it back down to ~162KB.

## Verification performed

- `npx tsc --noEmit` — clean (note: `mindmap-viewer/**` isn't in the root tsconfig's
  `include`, so it isn't type-checked by this command or by esbuild's `.md: 'text'` loader —
  an IDE-only diagnostic about `./sample.md` there is pre-existing from Phase 1, not a
  regression).
- `npm run build` and `npm run mindmap:build` — both pass.
- `node skills/blueprint-markdown/validate.mjs mindmap-viewer/sample.md` — passes.
- End-to-end Playwright checks: real `dist/preview.js` in a browser (including simulating a
  morphdom wipe to confirm state survives), and a real exported HTML file loading cytoscape
  from the actual jsDelivr CDN.

## Not done / out of scope (flagged, not fixed)

- Pre-existing, unrelated dead code: `src/core/index.ts`'s `createRenderer()` public API
  transitively depends on `vscode`/`fs`/`path` despite its docstring implying pure-browser
  use; confirmed unused elsewhere. Left alone (surgical-changes principle) — worth a look
  if anyone asks about that file.