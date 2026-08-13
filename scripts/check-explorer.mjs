/**
 * check-explorer.mjs — runnable assert check for splitAtMermaidFence.
 *
 * No test framework in this repo. Transpiles the TS module to a throwaway
 * CJS file and requires it, mirroring esbuild.mjs:280-293.
 *
 * Run: node scripts/check-explorer.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as esbuild from 'esbuild'

if (!fs.existsSync('dist')) fs.mkdirSync('dist', { recursive: true })
const tmpFile = path.resolve('dist', '.tmp-explorer.cjs')
await esbuild.build({
  entryPoints: ['src/core/directives/explorer.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: tmpFile,
  logLevel: 'silent',
})
const { splitAtMermaidFence } = createRequire(import.meta.url)(tmpFile)
try { fs.unlinkSync(tmpFile) } catch {}

const text = (...lines) => ({ type: 'text', lines })
const warn = { type: 'directive', form: 'container', name: 'warning', attrs: {}, children: [] }

// 1. Basic split: fence pins, headings scroll.
{
  const { pin, detail } = splitAtMermaidFence([
    text('', '```mermaid', 'graph TD', '  N1["1. A"]', '```', '', '### 1. A', 'Body.'),
  ])
  assert.deepEqual(pin, [text('', '```mermaid', 'graph TD', '  N1["1. A"]', '```')])
  assert.deepEqual(detail, [text('', '### 1. A', 'Body.')])
}

// 2. A sibling directive after the text node lands in the detail pane.
//    This is the ":::warning{title='Not shown'}" case — it must not be lost.
{
  const { pin, detail } = splitAtMermaidFence([
    text('```mermaid', 'graph TD', '```', '### 1. A'),
    warn,
  ])
  assert.deepEqual(pin, [text('```mermaid', 'graph TD', '```')])
  assert.equal(detail.length, 2)
  assert.deepEqual(detail[0], text('### 1. A'))
  assert.equal(detail[1], warn)
}

// 3. Lines before the fence stay in the pin pane (intro text above the diagram).
{
  const { pin, detail } = splitAtMermaidFence([
    text('Intro line.', '', '```mermaid', 'graph TD', '```', '### 1. A'),
  ])
  assert.deepEqual(pin, [text('Intro line.', '', '```mermaid', 'graph TD', '```')])
  assert.deepEqual(detail, [text('### 1. A')])
}

// 4. No mermaid fence: pin is empty, everything renders as detail.
{
  const { pin, detail } = splitAtMermaidFence([text('Just prose.', '### 1. A')])
  assert.deepEqual(pin, [])
  assert.deepEqual(detail, [text('Just prose.', '### 1. A')])
}

// 5. A ```mermaid inside a ````markdown example is NOT the pin — the outer
//    fence is skipped whole. (The spec and plan both contain that shape.)
{
  const { pin, detail } = splitAtMermaidFence([
    text('````markdown', ':::explorer', '```mermaid', 'graph TD', '```', ':::', '````', '### 1. A'),
  ])
  assert.deepEqual(pin, [])
  assert.equal(detail.length, 1)
}

// 6. Unclosed mermaid fence: pin takes everything, detail is empty.
{
  const { pin, detail } = splitAtMermaidFence([text('```mermaid', 'graph TD')])
  assert.deepEqual(pin, [text('```mermaid', 'graph TD')])
  assert.deepEqual(detail, [])
}

// 7. Undefined children (leaf-shaped node) does not throw.
{
  const { pin, detail } = splitAtMermaidFence(undefined)
  assert.deepEqual(pin, [])
  assert.deepEqual(detail, [])
}

console.log('✓ splitAtMermaidFence: 7 checks passed')
