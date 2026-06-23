# Changelog

## [0.1.0] — 2024-06-23

### Added

- Initial release of **Blueprint Markdown**.
- Directive grammar: container blocks (`:::name{attrs}…:::`), leaf blocks (`::name{attrs}`), and inline elements (`:name[text]{attrs}`).
- Components: card, cards grid, callout (note/tip/info/warning/danger/success), collapse/details, accordion, columns, timeline, tabs, steps, progress bar.
- Inline elements: chip, icon (Material Symbols Outlined), color, kbd, button, tooltip, rating.
- Line-highlighted code blocks with title bar (```` ```js {1,3-5} title="app.js" ````).
- Mermaid diagram support (bundled, CSP-safe).
- Warm Artisan Editorial theme (light/dark/auto via `blueprintMarkdown.theme`).
- Offline fonts: DM Sans, Playfair Display, JetBrains Mono, Material Symbols Outlined.
- `==highlight==` and `- [ ]` / `- [x]` task list support.
- Clickable inline file references (`\`src/file.ts:73\``).
