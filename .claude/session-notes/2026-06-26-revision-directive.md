# Session Handoff — revision directive
**Date:** 2026-06-26 · **Project:** enhanced-markdown-vscode · **Branch:** master

> For the next AI session: read this file first to resume. It captures the
> requirements, decisions, rules, and current state of the work below.

## Requirements & Goals

- Add a `:::revision` directive to the blueprint-markdown VS Code extension.
- The directive lets an AI author flag that a passage changed and store the previous version.
- **Current content must render exactly as normal prose** — no border, no wrapper padding, nothing that changes the page layout.
- A thin **vertical change-bar** appears in the left gutter (like a git diff bar) spanning the full block height.
- **Hover** the bar → small tooltip showing `note` and `date` attributes.
- **Click** the bar (only when `:::previous` child exists) → floating previous-version popover, full block width, positioned above or below based on viewport space; overlays content, never pushes it.
- Syntax: `:::revision{note="..." date="..."}` containing current text + nested `:::previous` block.
- Update `skills/blueprint-markdown/SKILL.md` and `references/syntax.md` so AI can write the directive correctly.

## Decisions & Rationale

- **`position:fixed` for the popover panel** — chosen to escape `overflow:hidden` on parent containers (cards, tabs, details). Alternative `position:absolute` + z-index lifting was tried first but failed when nested inside cards. `position:fixed` + `getBoundingClientRect()` is the correct solution.
- **Hover tooltip reuses existing tooltip tokens** (`--tooltip-bg`, `--tooltip-text`, `--tooltip-radius`, `--shadow-md`) — consistent with the existing `:tooltip[...]` inline widget.
- **Popover panel uses card style** (`--surface`, `--border`, `--radius-md`, `--shadow-lg`, danger left-border on body) — not tooltip style. An earlier attempt changed the panel to tooltip style; the user explicitly reverted it.
- **No hint rendered when both `note` and `date` are absent** — the button still renders (visual bar) but the `<span class="revision__hint">` is omitted entirely.
- **No `:::previous` → no click** — `data-has-prev` attribute drives both the pointer cursor and the JS click handler.
- **Popover is transient** — it closes on scroll, Esc, or outside-click. No state preservation across morphdom re-renders (correct for a "peek" interaction).
- **`previous` directive registered as a passthrough** — a stray `:::previous` outside a `:::revision` still renders its content rather than triggering a fail-soft block.
- **Grammar auto-regenerates** — `revision` and `previous` names appear in the TextMate grammar automatically on `npm run build` (picked up from the directive registry).

## Rules & Constraints

- **Never change main content display** — the `.revision` wrapper is `position:relative` only; no border, padding, background, or margin.
- **Gutter bar at `left:-14px`** — fits within the 48px body padding (`--sp-2xl`) present on both the live preview body and the exported HTML `.output-pane`.
- **Hint tooltip only when `note || date`** — do not render an empty `<span class="revision__hint">`.
- **Panel uses `position:fixed`** — do not revert to `position:absolute`; it breaks inside cards.
- **JS in `hydrate.ts` only** — all interactivity lives in the existing delegated `onDocClick` and `wireOnce()`. No new script tags or separate files.
- **Scroll closes the panel** — `document.addEventListener('scroll', ..., true)` is wired once in `wireOnce()`.
- **No inline `:ins`/`:del` diff marks** — user explicitly declined these; for word-level emphasis, `==highlight==` (GFM mark) is the recommended approach.
- **No multi-revision history** — only one `:::previous` block per `:::revision`.
- **`validate.mjs` must stay in sync** — `revision: ['container'], previous: ['container']` are already added.

## State, Files & Next Steps

**Current state:** Done — feature is built, tested via `npm run build` (clean), and showcased.

**Key files:**
- `src/core/directives/revision.ts` — directive specs for `revision` and `previous`; renders gutter marker, hint tooltip, and hidden panel
- `src/core/hydrate.ts` — `openRevisionPanel` (fixed positioning), `closeAllRevisionPanels`, Esc/scroll listeners wired in `wireOnce()`
- `media/components.css` — `.revision*` CSS block (gutter bar, hint tooltip, panel card style); search for `/* ─── Revision ───`
- `media/em-theme.css` — no revision-specific overrides currently; tooltip tokens and surface tokens handle theming automatically
- `src/core/directives/index.ts` — imports and spreads `revisionDirectives`
- `skills/blueprint-markdown/SKILL.md` — **Revision** catalog entry (after Steps section)
- `skills/blueprint-markdown/references/syntax.md` — `:::revision / :::previous` attribute tables
- `skills/blueprint-markdown/validate.mjs` — `revision` and `previous` in the `REGISTRY` map
- `media/readme/showcase.md` — live examples of `:::revision` nested inside callout, card, step, timeline event, and details

**Open questions:**
- The hover hint tooltip (`.revision__hint`) positioned at `left: calc(100% + 10px); top: 0` relative to the marker — not yet tested inside narrow containers (e.g. a card with little horizontal space). If it clips, it may need to be converted to `position:fixed` too (would require JS, same pattern as the panel).
- Dark-theme visual polish for the panel: currently uses `var(--surface)` / `var(--border)` tokens which should theme automatically, but no explicit dark-mode override was added for the danger left-border tint. Worth a visual check in each theme.

**Next steps:**
1. F5 launch in VS Code Extension Development Host and visually verify all `:::revision` instances in `media/readme/showcase.md` across at least 2–3 themes (especially dark/neon).
2. Verify hover tooltip isn't clipped inside narrow cards or the neon themes.
3. Verify above/below placement by scrolling the showcase page so a revision block is near the bottom of the viewport.
4. If the hint tooltip also needs `position:fixed`, follow the same pattern as `openRevisionPanel`: measure `getBoundingClientRect()` on the marker and set `position:fixed; left; top` via a `mouseenter` listener added in `wireOnce()`.
