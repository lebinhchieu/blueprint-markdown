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
`

fs.writeFileSync('media/hljs.css', hljsCss)
console.log('Wrote: media/hljs.css')

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

if (isWatch) {
  const extCtx     = await esbuild.context(extensionConfig)
  const previewCtx = await esbuild.context(previewConfig)
  await Promise.all([extCtx.watch(), previewCtx.watch()])
  console.log('Watching for changes...')
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(previewConfig),
  ])
  console.log('Build complete.')
}
