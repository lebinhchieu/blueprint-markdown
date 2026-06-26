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
  markdownit.ts             ← factory for the private markdown-it instance
```

### Two markdown-it instances

`markdownItPlugin.ts` installs rules on **VS Code's `md`** instance (passed via `extendMarkdownIt`). Rendering the text runs *inside* directives uses a **private `md`** instance (`createMarkdownIt()`). This avoids infinite recursion: VS Code's `md` has our block rule; if we used it to render nested content it would re-enter.

### Build pipeline (`esbuild.mjs`)

1. Copies font woff2 files from `node_modules/@fontsource*` to `media/fonts/`
2. Downloads `material-symbols-outlined.woff2` from CDN on first build
3. Writes `media/fonts.css` (assembled `@font-face` declarations)
4. Writes `media/hljs.css` (scoped atom-one-light/dark themes)
5. Transpiles the directive registry to a temp CJS module, reads all known names, and regenerates `syntaxes/blueprint.injection.tmLanguage.json`
6. Runs three parallel esbuild bundles: `extension.js`, `preview.js`, `export-client.js`

### Adding a new directive

1. Create `src/core/directives/myfeature.ts` exporting a `Record<string, DirectiveSpec>`
2. Import and spread it inside `buildRegistry()` in `src/core/directives/index.ts`
3. Re-run `npm run build` — the TextMate grammar regenerates automatically from the registry
4. Add the new name(s) and form(s) to the `REGISTRY` map in `skills/blueprint-markdown/validate.mjs`

### Adding a new theme

1. Add CSS custom-property overrides for the new theme name in `media/em-theme.css` and/or `media/tokens.css` (scoped to `body[data-em-theme="your-name"]`)
2. Add the name to the `blueprintMarkdown.theme` enum (and its `enumDescriptions`) in `package.json`

### Directive syntax summary

| Form | Syntax | Parsed as |
|------|--------|-----------|
| Container | `:::name{attrs}` … `:::` | `DirectiveNode` with `children` |
| Leaf (block) | `::name{attrs}` | `DirectiveNode`, no children |
| Inline | `:name[text]{attrs}` | handled by the inline markdown-it rule |

Fenced code blocks (```` ``` … ``` ````) are opaque to the parser — lines inside them are never classified as directives.

### Theme injection

On every render, the `em_theme_marker` core rule in `markdownItPlugin.ts` prepends a hidden `<div class="em-theme-config" data-em-theme="…">` to the output. `previewRuntime.applyTheme()` reads this marker and stamps `body[data-em-theme]`, which drives `em-theme.css` and `hljs.css` selector scoping.
