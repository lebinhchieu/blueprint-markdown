/**
 * esbuild.mjs — Build script for blueprint-markdown-preview extension.
 *
 * Produces two bundles:
 *   dist/extension.js — Node/CJS, extension host (no DOM)
 *   dist/preview.js   — Browser/IIFE, runs in preview webview (mermaid bundled in)
 *
 * Also:
 *   - Copies font woff2 files from @fontsource packages to media/fonts/
 *   - Downloads Material Symbols woff2 if not present
 *   - Assembles media/fonts.css and media/hljs.css
 */

import * as esbuild from 'esbuild'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { createRequire } from 'module'

const isWatch = process.argv.includes('--watch')
const isProd  = process.argv.includes('--production')

// ─── Step 1: Fonts ───────────────────────────────────────────────────────────

const fontsDir = 'media/fonts'
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true })

function copyFont(src, dst) {
  const fullSrc = path.join('node_modules', src)
  const fullDst = path.join(fontsDir, dst)
  if (fs.existsSync(fullSrc) && !fs.existsSync(fullDst)) {
    fs.copyFileSync(fullSrc, fullDst)
    console.log(`Copied: ${dst}`)
  }
}

// DM Sans variable font (normal + italic)
copyFont('@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', 'dm-sans-normal.woff2')
copyFont('@fontsource-variable/dm-sans/files/dm-sans-latin-wght-italic.woff2', 'dm-sans-italic.woff2')

// JetBrains Mono (individual weights)
copyFont('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-400.woff2')
copyFont('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jetbrains-mono-500.woff2')

// Playfair Display variable
copyFont('@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2', 'playfair-display-normal.woff2')
copyFont('@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2', 'playfair-display-italic.woff2')

// Material Symbols Outlined — download from CDN once and cache locally
const materialSymbolsPath = path.join(fontsDir, 'material-symbols-outlined.woff2')
if (!fs.existsSync(materialSymbolsPath)) {
  await downloadMaterialSymbols(materialSymbolsPath)
}

async function downloadMaterialSymbols(outPath) {
  // Fetch the CSS to find the actual woff2 URL (URL contains version hash)
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
  console.log('Fetching Material Symbols font URL...')
  try {
    const css = await fetchText(cssUrl, {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)
    if (!match) {
      console.warn('Could not find Material Symbols woff2 URL in CSS; icons will use text fallback')
      return
    }
    await downloadBinary(match[1], outPath)
    console.log('Downloaded: material-symbols-outlined.woff2')
  } catch (e) {
    console.warn('Could not download Material Symbols font (offline?); icons will use text fallback:', e.message)
  }
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchText(res.headers.location, headers))
        return
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function downloadBinary(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath)
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(outPath)
        resolve(downloadBinary(res.headers.location, outPath))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', err => { fs.unlinkSync(outPath); reject(err) })
  })
}

// ─── Step 2: Assemble fonts.css ───────────────────────────────────────────────

fs.writeFileSync('media/fonts.css', `/* fonts.css — @font-face declarations for bundled fonts */

@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('./fonts/dm-sans-normal.woff2') format('woff2-variations');
}

@font-face {
  font-family: 'DM Sans';
  font-style: italic;
  font-weight: 300 700;
  font-display: swap;
  src: url('./fonts/dm-sans-italic.woff2') format('woff2-variations');
}

@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('./fonts/playfair-display-normal.woff2') format('woff2-variations');
}

@font-face {
  font-family: 'Playfair Display';
  font-style: italic;
  font-weight: 400 700;
  font-display: swap;
  src: url('./fonts/playfair-display-italic.woff2') format('woff2-variations');
}

@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-400.woff2') format('woff2');
}

@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-500.woff2') format('woff2');
}

@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 100 700;
  font-display: block;
  src: url('./fonts/material-symbols-outlined.woff2') format('woff2');
  font-variation-settings: normal;
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
`)
console.log('Wrote: media/fonts.css')

// ─── Step 3: Assemble hljs.css ───────────────────────────────────────────────

const hljsLight = fs.existsSync('node_modules/highlight.js/styles/atom-one-light.min.css')
  ? fs.readFileSync('node_modules/highlight.js/styles/atom-one-light.min.css', 'utf8')
  : '/* atom-one-light not found */'

const hljsDark = fs.existsSync('node_modules/highlight.js/styles/atom-one-dark.min.css')
  ? fs.readFileSync('node_modules/highlight.js/styles/atom-one-dark.min.css', 'utf8')
  : '/* atom-one-dark not found */'

// Wrap each theme in a body-class scope
/**
 * Prefix every CSS selector in the hljs stylesheet with scope selectors.
 * Handles comma-separated scopeSelector by cross-producting with each rule.
 * Skips @-rules.  Works on the minified hljs format (no nesting).
 *
 * Example:
 *   scopeHljs(".hljs{color:#333}", "body.vscode-dark, body.vscode-high-contrast")
 *   → "body.vscode-dark .hljs, body.vscode-high-contrast .hljs {color:#333}"
 */
function scopeHljs(css, scopeSelector) {
  const scopes = scopeSelector.split(',').map(s => s.trim())
  return css.replace(/([^@{}][^{}]*)\{/g, (_match, selectors) => {
    const rules = selectors.trim().split(',').map(s => s.trim())
    const prefixed = []
    for (const scope of scopes) {
      for (const rule of rules) {
        prefixed.push(`${scope} ${rule}`)
      }
    }
    return `${prefixed.join(', ')} {`
  })
}

// Replace the hardcoded hljs background with the CSS custom property so each
// theme's --code-bg drives the code block background automatically.
const hljsDarkScoped = scopeHljs(hljsDark, 'body[data-em-theme="dark"]')
  .replace(/background:#282c34/g, 'background:var(--code-bg)')

// Neon themes share the atom-one-dark palette but on their own --code-bg.
// body[data-em-theme^="neon-"] covers all three variants in one selector set.
const hljsNeonScoped = scopeHljs(hljsDark, 'body[data-em-theme^="neon-"]')
  .replace(/background:#282c34/g, 'background:var(--code-bg)')

const hljsTropicalSorbetNightScoped = scopeHljs(hljsDark, 'body[data-em-theme="tropical-sorbet-night"]')
  .replace(/background:#282c34/g, 'background:var(--code-bg)')

const hljsCss = `/* hljs.css — Syntax highlighting themes, scoped to the em-theme attribute.
 *
 * Light (atom-one-light) is the default: emitted unscoped so it applies even
 * before preview.js runs and stamps body[data-em-theme].
 * Dark (atom-one-dark) is scoped to body[data-em-theme="dark"]; being an
 * attribute selector it has higher specificity than the unscoped class rules,
 * so it wins cleanly when the attribute is present.
 * Neon themes (neon-synthwave, neon-cyberpunk, neon-vaporwave) also use
 * atom-one-dark colors, scoped via the ^="neon-" attribute prefix selector.
 */

/* Light theme (default, no scope needed) */
${hljsLight}

/* Dark theme */
${hljsDarkScoped}

/* Neon themes (all variants) */
${hljsNeonScoped}

/* Tropical Sorbet Night theme */
${hljsTropicalSorbetNightScoped}
`

fs.writeFileSync('media/hljs.css', hljsCss)
console.log('Wrote: media/hljs.css')

// ─── Step 3.1: Regenerate media/em-theme.css from media/themes/*.css ─────────

{
  const THEME_ORDER = [
    'dark', 'neon-synthwave', 'neon-cyberpunk', 'neon-vaporwave',
    'aurora', 'jewel-garden', 'tropical-sorbet', 'tropical-sorbet-night',
  ]
  const parts = THEME_ORDER.map(name => fs.readFileSync(`media/themes/${name}.css`, 'utf8'))
  fs.writeFileSync('media/em-theme.css', '/* AUTO-GENERATED — edit files in media/themes/ instead */\n\n' + parts.join('\n'))
  console.log('Wrote: media/em-theme.css')
}

// ─── Step 3.5: Generate TextMate injection grammar ───────────────────────────
// Bundle the directive registry to a temp CJS file so we can enumerate
// known directive names (bucketed by form) at build time — zero drift.

{
  const syntaxesDir = 'syntaxes'
  if (!fs.existsSync(syntaxesDir)) fs.mkdirSync(syntaxesDir, { recursive: true })
  if (!fs.existsSync('dist'))      fs.mkdirSync('dist', { recursive: true })

  // Transpile the TypeScript registry to a throwaway CJS module.
  const tmpFile = path.resolve('dist', '.tmp-registry.cjs')
  await esbuild.build({
    entryPoints: ['src/core/directives/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: tmpFile,
    logLevel: 'silent',
  })
  const _require = createRequire(import.meta.url)
  const { buildRegistry } = _require(tmpFile)
  const registry = buildRegistry()
  try { fs.unlinkSync(tmpFile) } catch (_) {}

  // Bucket known names by form
  const names = { container: [], leaf: [], inline: [] }
  for (const [name, spec] of Object.entries(registry)) {
    for (const form of spec.forms) {
      if (names[form]) names[form].push(name)
    }
  }

  const containerAlt = names.container.length ? names.container.join('|') : '__none__'
  const leafAlt      = names.leaf.length      ? names.leaf.join('|')      : '__none__'
  const inlineAlt    = names.inline.length    ? names.inline.join('|')    : '__none__'

  // Attr block content: `(?:[^}"']|"[^"]*"|'[^']*')*`
  // Matches any char except }, ", ' OR a double/single quoted string (allowing } inside quotes).
  const attrInner = `(?:[^}"']|"[^"]*"|'[^']*')*`

  // Sub-patterns applied inside a captured attribute content group.
  const attrContentPatterns = [
    { comment: '#id', match: '#[\\w-]+',   name: 'entity.other.attribute-name.id.blueprint' },
    { comment: '.class', match: '\\.[\\w-]+', name: 'entity.other.attribute-name.class.blueprint' },
    {
      comment: 'key=value',
      match: '([\\w-]+)(=)',
      captures: {
        '1': { name: 'entity.other.attribute-name.blueprint' },
        '2': { name: 'keyword.operator.assignment.blueprint' },
      },
    },
    { comment: 'double-quoted string', match: '"(?:[^"\\\\]|\\\\.)*"', name: 'string.quoted.double.blueprint' },
    { comment: "single-quoted string", match: "'(?:[^'\\\\]|\\\\.)*'", name: 'string.quoted.single.blueprint' },
    { comment: 'bare word (primary arg or flag)', match: '[\\w-]+', name: 'variable.other.directive-attr.blueprint' },
  ]

  // Captures for block directives (container open + leaf):
  //   group 1 = marker (:::  or ::)
  //   group 2 = name
  //   group 3 = opening {
  //   group 4 = attrs content
  //   group 5 = closing }
  function blockCaptures(nameScope) {
    return {
      '1': { name: 'punctuation.definition.directive.blueprint' },
      '2': { name: nameScope },
      '3': { name: 'punctuation.section.attributes.begin.blueprint' },
      '4': { patterns: [{ include: '#attr-contents' }] },
      '5': { name: 'punctuation.section.attributes.end.blueprint' },
    }
  }

  // Inline {attrs} capture: colors { } as punctuation, rest as attr-contents.
  const inlineAttrCapture = {
    patterns: [
      { match: '\\{', name: 'punctuation.section.attributes.begin.blueprint' },
      { match: '\\}', name: 'punctuation.section.attributes.end.blueprint' },
      { include: '#attr-contents' },
    ],
  }

  const grammar = {
    name: 'Blueprint Markdown Directives',
    scopeName: 'text.html.markdown.blueprint',
    // L: prefix → inject before the base grammar's tokens.
    // Exclusions prevent the grammar from applying inside fenced code or raw blocks.
    injectionSelector: 'L:text.html.markdown -markup.fenced_code -markup.raw',
    patterns: [
      { include: '#directive-close' },
      { include: '#directive-open-known' },
      { include: '#directive-open-unknown' },
      { include: '#directive-leaf-known' },
      { include: '#directive-leaf-unknown' },
      { include: '#directive-inline-known' },
      { include: '#directive-inline-unknown' },
    ],
    repository: {
      // Sub-patterns for attribute block contents (applied via capture patterns).
      'attr-contents': { patterns: attrContentPatterns },

      // Inline [text] bracket coloring.
      'inline-text': {
        patterns: [
          { match: '\\[', name: 'punctuation.definition.string.begin.blueprint' },
          { match: '\\]', name: 'punctuation.definition.string.end.blueprint' },
          { match: '[^\\[\\]]+', name: 'string.unquoted.directive-text.blueprint' },
        ],
      },

      // ::: alone on a line → container close.
      // Must be listed before container-open to win on bare `:::`.
      'directive-close': {
        comment: 'Container close marker: bare ::: on its own line',
        match: '^\\s*(:::)\\s*$',
        captures: { '1': { name: 'punctuation.definition.directive.blueprint' } },
      },

      // :::known-name{attrs}
      'directive-open-known': {
        comment: 'Container open with a known directive name',
        match: `^\\s*(:::)(${containerAlt})(?:(\\{)(${attrInner})(\\}))?\\s*$`,
        captures: blockCaptures('entity.name.tag.directive.blueprint'),
      },

      // :::unknown-name{attrs} — silently fails in the preview
      'directive-open-unknown': {
        comment: 'Container open with an unrecognized name — silently fails in preview',
        match: `^\\s*(:::)([A-Za-z][\\w-]*)(?:(\\{)(${attrInner})(\\}))?\\s*$`,
        captures: blockCaptures('invalid.illegal.unknown-directive.blueprint'),
      },

      // ::known-name{attrs}  (leaf form — only `progress` today)
      'directive-leaf-known': {
        comment: 'Leaf directive with a known name (e.g. ::progress)',
        match: `^\\s*(::)(${leafAlt})(?:(\\{)(${attrInner})(\\}))?\\s*$`,
        captures: blockCaptures('entity.name.tag.directive.blueprint'),
      },

      // ::unknown-name{attrs}
      'directive-leaf-unknown': {
        comment: 'Leaf directive with an unrecognized name',
        match: `^\\s*(::)([A-Za-z][\\w-]*)(?:(\\{)(${attrInner})(\\}))?\\s*$`,
        captures: blockCaptures('invalid.illegal.unknown-directive.blueprint'),
      },

      // :known-name[text]{attrs}
      // The lookahead (?=\[|\{) mirrors the inline parser guard that prevents
      // bare colons in URLs (http://) and times (12:30) from triggering.
      'directive-inline-known': {
        comment: 'Inline directive with a known name, e.g. :chip[Active]{green}',
        match: `(:)(${inlineAlt})(?=\\[|\\{)(\\[[^\\]]*\\])?(\\{${attrInner}\\})?`,
        captures: {
          '1': { name: 'punctuation.definition.directive.blueprint' },
          '2': { name: 'entity.name.tag.directive.blueprint' },
          '3': { patterns: [{ include: '#inline-text' }] },
          '4': inlineAttrCapture,
        },
      },

      // :unknown-name[text]{attrs}
      'directive-inline-unknown': {
        comment: 'Inline directive with an unrecognized name',
        match: `(:)([A-Za-z][\\w-]*)(?=\\[|\\{)(\\[[^\\]]*\\])?(\\{${attrInner}\\})?`,
        captures: {
          '1': { name: 'punctuation.definition.directive.blueprint' },
          '2': { name: 'invalid.illegal.unknown-directive.blueprint' },
          '3': { patterns: [{ include: '#inline-text' }] },
          '4': inlineAttrCapture,
        },
      },
    },
  }

  const grammarPath = path.join(syntaxesDir, 'blueprint.injection.tmLanguage.json')
  fs.writeFileSync(grammarPath, JSON.stringify(grammar, null, 2))
  console.log(`Wrote: ${grammarPath}`)
}

// ─── Step 3.75: Assemble minified export-styles CSS (combined + per-theme) ───

{
  const BASE_CSS = ['reset.css', 'tokens.css', 'base.css', 'components.css']
  const baseCss = BASE_CSS.map(f => fs.readFileSync(`media/${f}`, 'utf8')).join('\n')
  const fontsCss = fs.readFileSync('media/fonts.css', 'utf8')
    .replace(/@font-face\s*\{[^}]*\}\s*/g, '')

  // hljs sections keyed by usage group
  const hljs = {
    light: hljsLight,
    dark: hljsDarkScoped,
    neon: hljsNeonScoped,
    tsn: hljsTropicalSorbetNightScoped,
  }

  const THEMES = [
    { name: 'light',                 themeFile: null,                        hljs: [hljs.light] },
    { name: 'dark',                  themeFile: 'dark.css',                  hljs: [hljs.light, hljs.dark] },
    { name: 'neon-synthwave',        themeFile: 'neon-synthwave.css',        hljs: [hljs.light, hljs.neon] },
    { name: 'neon-cyberpunk',        themeFile: 'neon-cyberpunk.css',        hljs: [hljs.light, hljs.neon] },
    { name: 'neon-vaporwave',        themeFile: 'neon-vaporwave.css',        hljs: [hljs.light, hljs.neon] },
    { name: 'aurora',                themeFile: 'aurora.css',                hljs: [hljs.light] },
    { name: 'jewel-garden',          themeFile: 'jewel-garden.css',          hljs: [hljs.light] },
    { name: 'tropical-sorbet',       themeFile: 'tropical-sorbet.css',       hljs: [hljs.light] },
    { name: 'tropical-sorbet-night', themeFile: 'tropical-sorbet-night.css', hljs: [hljs.light, hljs.tsn] },
  ]

  for (const t of THEMES) {
    const themeCss = t.themeFile ? fs.readFileSync(`media/themes/${t.themeFile}`, 'utf8') : ''
    const raw = [baseCss, themeCss, ...t.hljs, fontsCss].join('\n')
    const { code } = await esbuild.transform(raw, { loader: 'css', minify: true })
    fs.writeFileSync(`dist/export-styles-${t.name}.css`, code)
    console.log(`Wrote: dist/export-styles-${t.name}.css`)
  }

  // Combined file (all themes) kept for the VS Code preview static stylesheet list
  const allThemesCss = fs.readFileSync('media/em-theme.css', 'utf8')
  const fullRaw = [baseCss, allThemesCss, hljs.light, hljs.dark, hljs.neon, hljs.tsn, fontsCss].join('\n')
  const { code: fullMin } = await esbuild.transform(fullRaw, { loader: 'css', minify: true })
  fs.writeFileSync('dist/export-styles.css', fullMin)
  console.log('Wrote: dist/export-styles.css')
}

// ─── Step 4: esbuild bundles ─────────────────────────────────────────────────

const sharedConfig = {
  bundle: true,
  minify: isProd,
  sourcemap: !isProd,
}

// Extension host bundle (Node/CJS)
const extensionConfig = {
  ...sharedConfig,
  entryPoints: ['src/extension.ts'],
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode', 'mermaid'],
}

// Preview webview bundle (Browser/IIFE, mermaid bundled in)
const previewConfig = {
  ...sharedConfig,
  entryPoints: ['src/preview.ts'],
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/preview.js',
  // Bundle everything including mermaid — no dynamic imports in the output.
  // This satisfies the nonce-only CSP.
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
  // The built-in preview webview CSP is "default-src 'none'" — it blocks fetching
  // an external .map file.  Use an inline source map in dev (decoded by devtools
  // directly, no network fetch → no CSP violation) and omit it in production.
  sourcemap: isProd ? false : 'inline',
}

// Export-client bundle (Browser/IIFE, NO mermaid — loaded from CDN at runtime).
// This is the tiny script inlined in every exported HTML artifact.
const exportClientConfig = {
  ...sharedConfig,
  entryPoints: ['src/exportClient.ts'],
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/export-client.js',
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
  sourcemap: false,   // inlined into exported HTML; source maps not useful there
}

// Standalone CLI preview server (Node/CJS) — `blueprint-preview <file.md>`, for editors with
// no webview hook of their own (Zed today). Shares buildHtml.ts/installBlueprintMarkdown.ts
// with the VS Code extension and "Export to HTML"; `vscode` is never imported on this path.
const cliConfig = {
  ...sharedConfig,
  entryPoints: ['src/cli/preview.ts'],
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/blueprint-preview.js',
  banner: { js: '#!/usr/bin/env node' },
}

// Browser-side script for the CLI preview (Browser/IIFE) — live reload + the right-click
// comment menu. Separate from preview.js (VS Code webview) and export-client.js (frozen
// export snapshot, which has no file to write comments back to).
const cliClientConfig = {
  ...sharedConfig,
  entryPoints: ['src/cliClient.ts'],
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/cli-client.js',
  sourcemap: false,
}

if (isWatch) {
  const extCtx          = await esbuild.context(extensionConfig)
  const previewCtx      = await esbuild.context(previewConfig)
  const exportClientCtx = await esbuild.context(exportClientConfig)
  const cliCtx          = await esbuild.context(cliConfig)
  const cliClientCtx    = await esbuild.context(cliClientConfig)
  await Promise.all([extCtx.watch(), previewCtx.watch(), exportClientCtx.watch(), cliCtx.watch(), cliClientCtx.watch()])
  console.log('Watching for changes...')
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(previewConfig),
    esbuild.build(exportClientConfig),
    esbuild.build(cliConfig),
    esbuild.build(cliClientConfig),
  ])
  console.log('Build complete.')
}
