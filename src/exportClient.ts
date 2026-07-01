/**
 * exportClient.ts — Minimal browser runtime for the exported HTML artifact.
 *
 * Bundled into dist/export-client.js (browser/IIFE, NO mermaid or cytoscape).
 * The exported HTML loads mermaid/cytoscape from a CDN when needed and passes
 * them via window.mermaid / window.cytoscape / window.cytoscapeDagre.
 * runShared() receives them and renders through the same theme-aware path
 * used in the VS Code preview.
 *
 * This bundle is intentionally tiny: it contains only previewRuntime + hydrate.
 */

import { runShared } from './core/previewRuntime'

// Set by CDN <script> tags loaded before this one, only when the exported doc
// actually needs them — undefined otherwise, and runShared skips that library
// gracefully.
runShared((window as any).mermaid, (window as any).cytoscape, (window as any).cytoscapeDagre)
