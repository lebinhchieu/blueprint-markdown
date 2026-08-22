# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # one-shot build (fonts, CSS, grammar, esbuild bundles)
npm run watch        # watch mode (rebuilds on file change)
npm run package      # produce .vsix with vsce
npm run publish:ovsx # publish to Open VSX Registry
```

There are no automated tests. Development testing means launching the **Extension Development Host** from VS Code (F5), which runs `node esbuild.mjs` as a pre-launch task and opens a second window with the extension loaded.

**F5 passing is not proof the extension works.** Everything contributed through
`package.json` (`snippets`, `grammars`, `markdown.previewStyles`/`previewScripts`,
`commands`) is read from the source tree under F5 but from the packaged bundle after
install — a path missing from the `!`-allowlist in `.vscodeignore` vanishes silently,
with no error anywhere. Any change touching `contributes`, `.vscodeignore`, or files
under `media/` / `snippets/` / `syntaxes/` must be verified from a real install:

```bash
npm run package
code --install-extension blueprint-markdown-chieu-<version>.vsix
# reload, then exercise the feature in a normal window (not the Extension Dev Host)
```

**Mouse handlers: drive every button.** `core/mermaidPanZoom.ts` wires pan (right-drag,
`e.button !== 2` bails), reset/fit (double *right*-click, 400 ms), and right-click
(`contextmenu` suppressed) as separate code paths — a fix verified on one button
proves nothing about the others. Switching mermaid pan to right-drag silently broke
left-drag text selection (Jul 2026, three corrections in one sitting). Changing a
mouse handler means driving *every* button on that element: left drag, right drag,
double-click each, plus the resting cursor.

The preview webview isn't reachable by Playwright, but the **exported HTML is** —
it loads the same runtime. Run `blueprintMarkdown.exportHtml`, serve the file, and
drive it with `playwright-cli`. Then say which buttons you actually drove.

## Architecture

The extension has two runtimes that share a common core engine:

```
src/extension.ts            ← VS Code extension host entry point
src/markdownItPlugin.ts     ← installs block/inline rules into VS Code's markdown-it
src/preview.ts              ← browser entry, bundled into dist/preview.js
src/exportClient.ts         ← browser entry for exported HTML, dist/export-client.js
src/export/exportHtml.ts    ← "Export to HTML" command implementation

src/core/
  parser.ts                 ← source text → ASTNode[] (generic, no registry import)
  renderer.ts               ← ASTNode[] → HTML string (delegates to registry)
  directives/index.ts       ← assembles directive registry from individual files
  directives/*.ts           ← one file per component (card, callout, tabs, steps…)
  attrs.ts                  ← parses {key=value .class #id flag} attr strings
  colors.ts                 ← resolves color tokens (primary/success/…) to CSS values
  inline.ts                 ← installs :name[text]{attrs} inline rule
  fence.ts                  ← custom code fence renderer (hljs, line-highlight, title)
  inline-code.ts            ← inline-code renderer (file refs as links)
  hydrate.ts                ← browser-side tab/accordion hydration
  previewRuntime.ts         ← shared browser runtime (theme, mermaid SVG cache)
  mermaidPanZoom.ts         ← mermaid pan/zoom/reset/fullscreen (hand-rolled, no lib)
  explorerSync.ts           ← pairs mermaid nodes to :::explorer detail sections, click-to-scroll
  toc.ts                    ← TOC reading rail + scroll-spy (preview and exported HTML)
  commentInsert.ts          ← webview right-click → inserts :comment/:ai directives into source
  markdownit.ts             ← factory for the extension-host markdown-it instance
  markdownitBrowser.ts      ← browser-safe markdown-it factories (no vscode/fs deps)
```

### Two markdown-it instances

`markdownItPlugin.ts` installs rules on **VS Code's `md`** instance (passed via `extendMarkdownIt`). Rendering the text runs *inside* directives uses a **private `md`** instance (`createMarkdownIt()`). This avoids infinite recursion: VS Code's `md` has our block rule; if we used it to render nested content it would re-enter.

### Build pipeline (`esbuild.mjs`)

1. Copies font woff2 files from `node_modules/@fontsource*` to `media/fonts/`
2. Downloads `material-symbols-outlined.woff2` from CDN on first build
3. Writes `media/fonts.css` (assembled `@font-face` declarations) and `media/hljs.css` (scoped atom-one-light/dark themes)
4. Regenerates `media/em-theme.css` by concatenating `media/themes/*.css` in a fixed order — **never hand-edit `em-theme.css`**, it's overwritten every build
5. Transpiles the directive registry to a temp CJS module, reads all known names, and regenerates `syntaxes/blueprint.injection.tmLanguage.json`
6. Assembles minified per-theme CSS for the HTML export feature: `dist/export-styles-<theme>.css` per theme, plus a combined `dist/export-styles.css`
7. Runs three parallel esbuild bundles: `extension.js`, `preview.js`, `export-client.js`

### Adding a new directive

1. Create `src/core/directives/myfeature.ts` exporting a `Record<string, DirectiveSpec>`
2. Import and spread it inside `buildRegistry()` in `src/core/directives/index.ts`
3. Re-run `npm run build` — the TextMate grammar regenerates automatically from the registry
4. Add the new name(s) and form(s) to the `REGISTRY` map in `skills/blueprint-markdown/validate.mjs`

### Changing the parser, renderer, or preview runtime

Every directive is one token type (`em_directive`) behind one renderer, so a change in
`parser.ts`, `renderer.ts`, `markdownItPlugin.ts`, or `previewRuntime.ts` hits **all**
of them at once. Verify against a document exercising several forms — container, leaf,
inline, nested, and one inside a list/blockquote — not just the directive named in the
bug report.

Scroll sync is the fragile one. It works only because the `token.map` set on the
`em_directive` token reaches the `data-line`/`code-line` wrapper div in the renderer
rule (see `markdownItPlugin.ts`). Anything that re-wraps, replaces, or short-circuits
that output silently turns the directive back into a scroll-sync dead zone. Check a
nested/indented directive, not only a top-level one.

### Adding a new theme

`media/tokens.css` is the contract (every variable `components.css` reads); `media/em-theme.css` is generated from `media/themes/*.css` — don't edit it by hand.

1. Add `media/themes/your-name.css` with CSS custom-property overrides scoped to `body[data-em-theme="your-name"]`
2. Add the name to `THEME_ORDER` in `esbuild.mjs` (em-theme.css assembly) and to the `THEMES` array (export-styles assembly)
3. Add the name to the `blueprintMarkdown.theme` enum (and its `enumDescriptions`) in `package.json`
4. `npm run build` regenerates `media/em-theme.css` and `dist/export-styles-*.css`

### Directive syntax summary

| Form | Syntax | Parsed as |
|------|--------|-----------|
| Container | `:::name{attrs}` … `:::` | `DirectiveNode` with `children` |
| Leaf (block) | `::name{attrs}` | `DirectiveNode`, no children |
| Inline | `:name[text]{attrs}` | handled by the inline markdown-it rule |

Fenced code blocks (```` ``` … ``` ````) are opaque to the parser — lines inside them are never classified as directives.

### Client-rendered directives (mermaid)

Mermaid doesn't render its final output server-side — it emits an empty, sized
placeholder and a browser-side runtime fills it in after DOM insert (`renderMermaid`
in `previewRuntime.ts`). This is the pattern to follow for any future
client-rendered directive:

1. **Heavy library injected as a parameter, never imported by `previewRuntime.ts` itself** —
   `preview.ts` passes its statically-bundled instance; `exportClient.ts` passes
   `window.<lib>` (loaded from a CDN `<script>` that `exportHtml.ts` injects only when the
   doc actually uses that directive) or `undefined`. This keeps `dist/export-client.js` small.
2. **Survive VS Code's morphdom.** The built-in preview re-derives the whole DOM from
   source on every edit; since the server-rendered placeholder is always empty, morphdom
   wipes any children the runtime injected on the previous pass. Mermaid re-renders from a
   `theme+source → SVG` cache (cheap, but a visible flicker) — a directive with mutable
   client-side state (pan/zoom/collapse/…) would need something sturdier, e.g. keeping the
   live instance in a `WeakMap<HTMLElement, …>` keyed by the placeholder element and
   re-appending its still-live nodes when the source data is unchanged, instead of rebuilding.
3. Client-side markdown rendering (for on-demand snippets rendered in the browser) should use
   `createMinimalMarkdownIt()` from `markdownitBrowser.ts`, **not** `installFenceRenderer` —
   that pulls in all of highlight.js (~1 MB), which is fine for the extension host but not
   for a bundle that ships to a webview or an exported HTML file.

### Theme injection

On every render, the `em_theme_marker` core rule in `markdownItPlugin.ts` prepends a hidden `<div class="em-theme-config" data-em-theme="…">` to the output. `previewRuntime.applyTheme()` reads this marker and stamps `body[data-em-theme]`, which drives `em-theme.css` and `hljs.css` selector scoping.

## Docs maintenance

Don't touch `README.md`, `CHANGELOG.md`, or this file while a feature/fix is in progress — finish and verify the code change first. Once it's done, ask whether any of those need updating; don't update them unprompted. Keep whatever gets added lean: a one-line CHANGELOG entry, a targeted section edit — not a rewrite, not restating what the diff already makes obvious.
