/**
 * preview.ts — Browser entry point, bundled into dist/preview.js.
 *
 * VS Code injects this as a nonce'd <script> into the preview webview on
 * first load only (since VS Code 1.63 preview scripts are not re-executed on
 * content change — instead a 'vscode.markdown.updateContent' event fires).
 * The CSP forbids dynamic import(), so mermaid and cytoscape are bundled statically.
 *
 * Responsibilities:
 *   - Remove VS Code's built-in markdown/highlight styles that compete with ours.
 *   - Delegate everything else to previewRuntime.runShared().
 *
 * The mermaid theming, mindmap mounting, tab/accordion hydration, and theme-marker
 * logic live in src/core/previewRuntime.ts and are shared with the exported HTML artifact.
 */

import mermaid from 'mermaid'
import cytoscape from 'cytoscape'
import cytoscapeDagre from 'cytoscape-dagre'
import { runShared } from './core/previewRuntime'

// Drop VS Code's built-in markdown-language-features styles. Both files are
// superseded by our own:
//   - highlight.css (vs2015): competes with our atom-one hljs.css, leaks
//     #DCDCDC into .hljs-params → invisible on light backgrounds.
//   - markdown.css: reset.css already does `all: revert` on every element it
//     styles, so it contributes nothing after our reset loads.
function removeBuiltinStyles(): void {
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (/markdown-language-features\/media\/(highlight|markdown)\.css/i.test(link.href)) {
      link.remove()
    }
  })
}

function run(): void {
  removeBuiltinStyles()
  runShared(mermaid, cytoscape, cytoscapeDagre)
}

// Initial run on first load.
run()

// Since VS Code 1.63 contributed preview scripts run only once on first load.
// Subsequent edits update the DOM in place (morphdom) and fire this event
// instead of re-executing the script.
window.addEventListener('vscode.markdown.updateContent', () => run())
