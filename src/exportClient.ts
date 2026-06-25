/**
 * exportClient.ts — Minimal browser runtime for the exported HTML artifact.
 *
 * Bundled into dist/export-client.js (browser/IIFE, NO mermaid).
 * The exported HTML loads mermaid from a CDN when needed and passes it via
 * window.mermaid.  runShared() receives it and renders diagrams through the
 * same theme-aware path used in the VS Code preview.
 *
 * This bundle is intentionally tiny: it contains only previewRuntime + hydrate.
 */

import { runShared } from './core/previewRuntime'

// window.mermaid is set by the CDN <script> loaded before this script.
// If the exported doc has no mermaid blocks, no CDN script is emitted and
// window.mermaid is undefined — runShared skips diagram rendering gracefully.
runShared((window as any).mermaid)
