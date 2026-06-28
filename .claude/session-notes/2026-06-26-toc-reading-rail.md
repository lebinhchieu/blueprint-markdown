# Session Handoff — ToC Reading Rail
**Date:** 2026-06-26 · **Project:** enhanced-markdown-vscode · **Branch:** master

> For the next AI session: read this file first to resume. It captures the
> requirements, decisions, rules, and current state of the work below.

## Requirements & Goals

Build a **fixed right-edge Table of Contents "reading rail"** for the markdown preview:
- One dot per heading (h1–h3), arranged as a vertical timeline
- Connecting line between dots with **progress fill** (accent colour up to current section)
- **Hover** → full panel of all section titles fades in (right-to-left reveal); clicking a title smooth-scrolls to that heading
- Works in both the **live VS Code preview** and **exported HTML** (single file)
- Dots **compress to fit** the viewport when there are many headings (no scrollbar in collapsed state); panel scrolls on hover for long docs
- Rail auto-hides on viewports ≤ 720px wide and on docs with < 2 collected headings

## Decisions & Rationale

### Heading IDs — use our own attribute, not VS Code's slugifier
- VS Code stamps its own `id` attributes on headings using the GitHub slugifier (`accordion--faq` for "Accordion — FAQ"). Our `slugify()` collapses `--` → `-`, causing a mismatch.
- **Decision:** stamp `data-em-toc-id="<index>"` on each collected `heading_open` token (in the `em_toc` core rule). ToC links carry `data-toc-target="<index>"`. The JS click handler navigates by index, ignoring `href`. The `href="#slug"` is kept as a no-JS fallback.
- Slug IDs (`id` attribute) are still written to headings — they're authoritative in the export path where VS Code's slugifier is absent.

### Exclude directive-internal headings
- `showcase.md` has `### HTML Artifact` and `### Blueprint Markdown` inside `:::columns`. They render as real `<h3>` in the DOM but are **not** seen by the outer parser's token stream.
- **Decision:** scroll-spy queries `[data-em-toc-id]` (only headings our rule stamped), not `h1[id],h2[id],h3[id]`. The 1:1 index alignment between headings and ToC items is guaranteed.

### CSS layout — `overflow:hidden` + `width` transition, not `::before` pseudo-element
- First attempt used a `::before` pseudo-element (z-index: -1, backdrop-filter) as the panel backdrop. This caused a **Chromium compositing bug**: backdrop-filter elements with negative z-index render *over* sibling content in VS Code's webview, making dots invisible.
- Also used `100svh` which is unsupported in VS Code's older Chromium (falls back to 0).
- **Decision:** `.em-toc` is the panel itself. `width: 22px` collapsed → `width: 260px` on hover, with `overflow: hidden` clipping labels when narrow. No z-index juggling. `100vh` used instead of `100svh`.

### Dot centering — `.em-toc__dot-col` wrapper
- Dots have three sizes (h1=10px, h2=7px, h3=5px). Without a wrapper, right-aligning dots of different sizes puts their *centres* at different x-positions → connecting line can't thread through all of them.
- **Decision:** wrap each dot in `<span class="em-toc__dot-col">` (18px fixed-width, flex-centred). The connecting line's `right: 9px` anchors exactly through all dot centres.

### Progress line — CSS gradient driven by JS CSS variable
- `--toc-progress` (0–1) is written to `.em-toc__list` by `updateActive()` on every scroll.
- `.em-toc__list::before` uses `linear-gradient(--c-primary <pct>%, --border-color <pct>%)` to split the line colour at the active position.

### Hover panel expand + labels
- Labels (`em-toc__label`) are in-flow (flex: 1, right-aligned), hidden via `opacity: 0`. The `overflow: hidden` on `.em-toc` collapses them when the container is 22px wide — zero invisible hit area (fixes the original "hover triggers on invisible wide box" bug).
- Staggered opacity transition on reveal (0–78ms delay per nth-child).
- On hover, items expand from compressed height to `min-height: 1.75rem` (transition); the list allows `overflow-y: auto` so long panels scroll. `onRailEnter` centres the active item in the panel on mouseenter.

## Rules & Constraints

- **Only theme tokens** in CSS: `--c-primary`, `--bg-raised`, `--shadow-lg`, `--border-color`, `--text-faint`, `--text-muted`, `--text-base`, `--font-sans`, `--sp-*`, `--radius-*`. Never hard-coded colours — must work across all ~10 themes.
- **Wire-once + delegation pattern** (mirror of `hydrate.ts`): all event listeners on `document` with a `wired` guard. `setupToc(root)` rebuilds the heading/item arrays on every render call (morphdom replaces nodes each keystroke).
- `components.css` is already registered in `package.json` `markdown.previewStyles` and inlined by `exportHtml.ts` — no new file registration needed.
- No new npm dependencies. No `esbuild.mjs` or `package.json` changes. No grammar regen.
- ToC logic lives in a **new `src/core/toc.ts`** imported by `previewRuntime.ts`. esbuild bundles it into `preview.js` and `export-client.js` automatically.
- The `em_toc` core rule lives in `markdownItPlugin.ts`, pushed after `em_theme_marker`. It skips `state.inlineMode` (same guard as all other core rules here).

## State, Files & Next Steps

**Current state:** in-progress — functionally complete but not visually verified after the last CSS rewrite. The user reported "no dots show, completely white on revealing" after the previous CSS iteration; the root cause was diagnosed (Chromium compositing bug with `::before` + `backdrop-filter` + `z-index:-1`) and a full rewrite was applied. The build passes (`npm run build` → Build complete). Manual testing via F5 → Extension Development Host is needed.

**Key files:**

- `src/markdownItPlugin.ts` — `em_toc` core rule (lines ~233–295): collects h1–h3 tokens, stamps `id` + `data-em-toc-id`, emits `<nav class="em-toc">` HTML with `<span class="em-toc__dot-col">` wrappers and `data-toc-target` on links. Helper functions `slugify()` and `escapeHtml()` appended at end of file.
- `src/core/toc.ts` — new file: `setupToc(root)`, wire-once delegation, `onTocClick` (index-based nav), `onRailEnter` (scroll active into view on mouseenter), `updateActive` (scroll-spy + writes `--toc-progress` to list element).
- `src/core/previewRuntime.ts` — `setupToc(root)` called in `runShared()` after `hydrate(root)`.
- `media/components.css` — `.em-toc` block appended at end (~line 1002 onward). Uses `overflow:hidden` + `width` transition. `::before` on `.em-toc__list` is the progress line.

**Open questions:**

- Visual verification pending: do dots appear correctly with the new `overflow:hidden` layout? Does the `width` transition feel smooth? Does the progress line colour correctly on scroll?
- Is the `color-mix(in srgb, ...)` syntax supported in VS Code's webview Chromium version? (Used for active dot glow `box-shadow`.) If not, replace with a hardcoded `rgba()` fallback.
- The `scrollActiveIntoView` listens on `mouseenter` with capture on `document`, checking `e.target.classList.contains('em-toc')`. In VS Code's webview, `mouseenter` may or may not bubble to `document` capture — needs verification.
- No visual test of the exported HTML path this session.

**Next steps:**

1. F5 → Extension Development Host → open `media/readme/showcase.md` in preview.
2. Verify dots are visible as a thin strip on the right edge.
3. Verify hover reveals panel with smooth `width` animation (no jump, no white box covering content).
4. Click `Accordion — FAQ`, `Progress & Stats`, `Code — Line Highlighting` → confirm smooth scroll (index-based nav).
5. Scroll doc → confirm active dot highlights, line fills with accent colour up to active section.
6. If `color-mix()` causes a rendering error, replace active dot `box-shadow` with `rgba()` equivalent.
7. If mouseenter scroll-into-view doesn't work in VS Code webview, switch listener to a `mouseover` delegate on `document` checking `closest('.em-toc')`.
8. Test exported HTML: Export to HTML → open in browser → verify rail works.
