#!/usr/bin/env node
/**
 * narrate.mjs — pre-generate Kokoro audio for every :::say in a markdown file.
 *
 *   npm run narrate -- docs/talk.md
 *
 * Writes one WAV per sentence to `.narration/` next to the file; present mode's
 * "Kokoro" voice plays them. Unchanged sentences are skipped, so re-running after an
 * edit only generates what changed. Sentence text comes from the real renderer (bundled
 * on the fly) so it matches present mode's data-speech exactly.
 */

import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const file = process.argv[2]
if (!file) {
  console.error('usage: npm run narrate -- <file.md>')
  process.exit(1)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = join(tmpdir(), `em-narrate-${process.pid}.mjs`)
await build({
  stdin: {
    contents: `
      export { parseBlocks } from './src/core/parser'
      export { createRenderTree } from './src/core/renderer'
      export { buildRegistry } from './src/core/directives/index'
      export { createBrowserMarkdownIt } from './src/core/markdownitBrowser'
      export { narrationFile, DEFAULT_KOKORO_VOICE, NARRATION_DIR } from './src/core/speech'
      export { splitSentences } from './src/core/present'`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: tmp,
  logLevel: 'error',
})
const core = await import(pathToFileURL(tmp).href)

const render = core.createRenderTree(core.createBrowserMarkdownIt(), core.buildRegistry())
const unescape = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Every (voice, sentence) pair, in document order, deduplicated. */
const jobs = new Map()
function walk(nodes, voice) {
  for (const n of nodes) {
    if (n.type !== 'directive') continue
    const v = n.name === 'narration' ? (n.attrs.named.voice || core.DEFAULT_KOKORO_VOICE) : voice
    if (n.name === 'say') {
      const speech = unescape(render([n]).match(/data-speech="([^"]*)"/)?.[1] ?? '')
      for (const s of core.splitSentences(speech)) jobs.set(core.narrationFile(v, s), { voice: v, text: s })
    } else if (n.children) walk(n.children, v)
  }
}
walk(core.parseBlocks(readFileSync(file, 'utf8')), core.DEFAULT_KOKORO_VOICE)

const docDir = dirname(resolve(file))
const todo = [...jobs].filter(([rel]) => !existsSync(join(docDir, rel)))
console.log(`${jobs.size} sentences, ${todo.length} to generate`)
if (!todo.length) process.exit(0)

const { KokoroTTS } = await import('kokoro-js')
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
mkdirSync(join(docDir, core.NARRATION_DIR), { recursive: true })
let i = 0
for (const [rel, { voice, text }] of todo) {
  const audio = await tts.generate(text, { voice })
  await audio.save(join(docDir, rel))
  console.log(`[${++i}/${todo.length}] ${text.slice(0, 70)}`)
}
