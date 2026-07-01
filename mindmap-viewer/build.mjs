/**
 * build.mjs — bundles the standalone mindmap viewer.
 * Run from the repo root: `npm run mindmap:build` / `npm run mindmap:watch`.
 */

import * as esbuild from 'esbuild'

const isWatch = process.argv.includes('--watch')

const config = {
  entryPoints: ['mindmap-viewer/main.ts'],
  outfile: 'mindmap-viewer/dist/main.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  sourcemap: 'inline',
  loader: { '.md': 'text' },
}

if (isWatch) {
  const ctx = await esbuild.context(config)
  await ctx.watch()
  console.log('Watching mindmap-viewer for changes...')
} else {
  await esbuild.build(config)
  console.log('Built: mindmap-viewer/dist/main.js')
}
