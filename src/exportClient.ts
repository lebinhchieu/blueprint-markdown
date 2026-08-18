/**
 * exportClient.ts — Minimal browser runtime for the exported HTML artifact.
 *
 * Bundled into dist/export-client.js (browser/IIFE, NO mermaid).
 * The exported HTML loads mermaid from a CDN when needed and passes it via
 * window.mermaid. runShared() receives it and renders through the same
 * theme-aware path used in the VS Code preview.
 *
 * This bundle is intentionally tiny: it contains only previewRuntime + hydrate.
 */

import { runShared } from './core/previewRuntime'

// Set by a CDN <script> tag loaded before this one, only when the exported doc
// actually needs it — undefined otherwise, and runShared skips it gracefully.
runShared((window as any).mermaid)
