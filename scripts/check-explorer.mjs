/**
 * check-explorer.mjs — runnable assert checks for the two pieces of :::explorer
 * logic that fail silently: the mermaid-fence split, and the node-id regex that
 * decides which diagram types can be linked.
 *
 * No test framework in this repo. Transpiles the TS modules to throwaway CJS
 * files and requires them, mirroring esbuild.mjs:280-293.
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

// ── RE_NODE_ID — which diagram types link ────────────────────────────────────
// Probed against mermaid 11.15 on 2026-08-13. Each id below is a real value
// taken from a rendered SVG, not a guess.

const tmpSync = path.resolve('dist', '.tmp-explorer-sync.cjs')
await esbuild.build({
  entryPoints: ['src/core/explorerSync.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: tmpSync,
  logLevel: 'silent',
})
const { RE_NODE_ID } = createRequire(import.meta.url)(tmpSync)
try { fs.unlinkSync(tmpSync) } catch {}

const num = id => { const m = id.match(RE_NODE_ID); return m ? m[1] : null }

// Supported types — the author's N<k> survives into the id.
assert.equal(num('mermaid-1786602232448-flowchart-N1-0'), '1')  // graph / flowchart
assert.equal(num('mermaid-1786630164967-state-N2-0'), '2')      // stateDiagram-v2
assert.equal(num('mermaid-1786630165035-classId-N7-1'), '7')    // classDiagram

// N1 must not swallow N10 — the trailing dash is what separates them.
assert.equal(num('mermaid-1-flowchart-N10-2'), '10')
assert.notEqual(num('mermaid-1-flowchart-N10-2'), '1')

// Deliberately excluded: addressable, but mermaid 11.15 rejects entity
// aliases, so the box would be labelled "N1" and the number never shown.
assert.equal(num('mermaid-1786630165006-entity-N1-0'), null)

// No author id in the DOM at all — matching these would be positional.
assert.equal(num('actor0'), null)                        // sequenceDiagram
assert.equal(num('mermaid-1786630165105-node-0'), null)  // timeline
assert.equal(num('mermaid-1786630165126-node_0'), null)  // mermaid mindmap
assert.equal(num('mermaid-1786630165204-task0'), null)   // journey

// Edge ids embed node names — they must never be mistaken for nodes.
assert.equal(num('mermaid-1786602232448-L_N1_N2_0'), null)

console.log('✓ RE_NODE_ID: 11 checks passed')
