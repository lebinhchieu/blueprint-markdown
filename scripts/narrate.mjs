#!/usr/bin/env node
/**
 * narrate.mjs — pre-generate Kokoro audio for every :::say in a markdown file.
 *
 *   npm run narrate -- docs/talk.md
 *
 * Writes one WAV per sentence to `.narration/` next to the file; present mode's
 * "Generated" voice plays them. English uses Kokoro; `:::narration{lang="vi"}` uses
 * VieNeu-TTS through scripts/vieneu_narrate.py, run with $VIENEU_PYTHON or
 * ~/.cache/blueprint-narrate/venv — set it up once with:
 *
 *   python3 -m venv ~/.cache/blueprint-narrate/venv
 *   ~/.cache/blueprint-narrate/venv/bin/pip install vieneu "onnxruntime<1.23"
 *
 * (onnxruntime 1.23+ rejects the model's external data through Hugging Face's symlinked cache.) Unchanged sentences are skipped, so re-running after an
 * edit only generates what changed. Sentence text comes from the real renderer (bundled
 * on the fly) so it matches present mode's data-speech exactly.
 */

import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
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
      export { narrationFile, defaultVoice, DEFAULT_LANG, NARRATION_DIR } from './src/core/speech'
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
function walk(nodes, lang, voice) {
  for (const n of nodes) {
    if (n.type !== 'directive') continue
    if (n.name === 'narration') {
      lang = n.attrs.named.lang || core.DEFAULT_LANG
      voice = n.attrs.named.voice || core.defaultVoice(lang)
    }
    if (n.name === 'say') {
      const speech = unescape(render([n]).match(/data-speech="([^"]*)"/)?.[1] ?? '')
      for (const s of core.splitSentences(speech)) jobs.set(core.narrationFile(voice, s), { lang, voice, text: s })
    } else if (n.children) walk(n.children, lang, voice)
  }
}
walk(core.parseBlocks(readFileSync(file, 'utf8')), core.DEFAULT_LANG, core.defaultVoice(core.DEFAULT_LANG))

const docDir = dirname(resolve(file))
const todo = [...jobs].filter(([rel]) => !existsSync(join(docDir, rel)))
console.log(`${jobs.size} sentences, ${todo.length} to generate`)
if (!todo.length) process.exit(0)

mkdirSync(join(docDir, core.NARRATION_DIR), { recursive: true })
let i = 0
const done = text => console.log(`[${++i}/${todo.length}] ${text.slice(0, 70)}`)
const vi = todo.filter(([, j]) => j.lang === 'vi')
const kokoro = todo.filter(([, j]) => j.lang !== 'vi')

if (kokoro.length) {
  const { KokoroTTS } = await import('kokoro-js')
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
  for (const [rel, { voice, text }] of kokoro) {
    await (await tts.generate(text, { voice })).save(join(docDir, rel))
    done(text)
  }
}

if (vi.length) {
  const python = process.env.VIENEU_PYTHON ?? join(homedir(), '.cache/blueprint-narrate/venv/bin/python')
  if (!existsSync(python)) {
    console.error(`VieNeu-TTS not found at ${python} — see the setup steps at the top of scripts/narrate.mjs`)
    process.exit(1)
  }
  const child = spawn(python, [join(root, 'scripts/vieneu_narrate.py')], { stdio: ['pipe', 'pipe', 'inherit'] })
  child.stdin.end(JSON.stringify(vi.map(([rel, { voice, text }]) => ({ text, voice, out: join(docDir, rel) }))))
  let buf = ''
  child.stdout.on('data', d => {
    const lines = (buf + d).split('\n')
    buf = lines.pop()
    lines.forEach(done)
  })
  const code = await new Promise(r => child.on('close', r))
  if (code) process.exit(code)
}
