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
const { splitAtMermaidFence, extractHeadingKeys } = createRequire(import.meta.url)(tmpFile)
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

// ── extractHeadingKeys — `{#id}` anchors on detail headings ──────────────────

// Trailing anchor moves to data-em-key and leaves the visible text clean.
assert.equal(
  extractHeadingKeys('<h3>AuthService {#auth}</h3>'),
  '<h3 data-em-key="auth">AuthService</h3>',
)

// House style: a trailing file ref before the anchor must survive intact.
assert.equal(
  extractHeadingKeys('<h3>Auth — <code class="file-ref">a.ts:1</code> {#auth}</h3>'),
  '<h3 data-em-key="auth">Auth — <code class="file-ref">a.ts:1</code></h3>',
)

// Existing attributes are preserved.
assert.equal(
  extractHeadingKeys('<h3 id="x">Auth {#auth}</h3>'),
  '<h3 id="x" data-em-key="auth">Auth</h3>',
)

// Not trailing → left completely alone, braces render as text.
assert.equal(extractHeadingKeys('<h3>{#store} Token</h3>'), '<h3>{#store} Token</h3>')
assert.equal(extractHeadingKeys('<h3>Mid {#mid} words</h3>'), '<h3>Mid {#mid} words</h3>')

// No anchor at all → untouched.
assert.equal(extractHeadingKeys('<h3>3. Cache</h3>'), '<h3>3. Cache</h3>')

// REGRESSION: a heading whose anchor is not trailing must not swallow the
// NEXT heading and steal its id. A single-pass regex over the whole document
// did exactly that — `{#store}` failed to match, the body ran past </h3> and
// consumed everything up to `{#dup}</h3>`, stamping "dup" on the wrong
// heading and silently deleting the right one's anchor.
{
  const out = extractHeadingKeys('<h3>{#store} Token</h3>\n<p>body</p>\n<h3>Dup {#dup}</h3>')
  assert.equal(out, '<h3>{#store} Token</h3>\n<p>body</p>\n<h3 data-em-key="dup">Dup</h3>')
}

// Two anchored headings in a row each keep their own id.
assert.equal(
  extractHeadingKeys('<h3>A {#a}</h3><h3>B {#b}</h3>'),
  '<h3 data-em-key="a">A</h3><h3 data-em-key="b">B</h3>',
)

// Different levels don't cross-match.
assert.equal(
  extractHeadingKeys('<h2>A {#a}</h2><h4>B {#b}</h4>'),
  '<h2 data-em-key="a">A</h2><h4 data-em-key="b">B</h4>',
)

console.log('✓ extractHeadingKeys: 9 checks passed')

// ── Pairing keys — which elements link, and to which heading ─────────────────
// Probed against mermaid 11.15 (2026-08-13 nodes, 2026-08-14 clusters). Every
// id below is a real value taken from a rendered SVG, not a guess.

const tmpSync = path.resolve('dist', '.tmp-explorer-sync.cjs')
await esbuild.build({
  entryPoints: ['src/core/explorerSync.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: tmpSync,
  logLevel: 'silent',
})
const { RE_NODE_ID, RE_CLUSTER_ID, lookupHeading } = createRequire(import.meta.url)(tmpSync)
try { fs.unlinkSync(tmpSync) } catch {}

const nodeKey = id => { const m = id.match(RE_NODE_ID); return m ? m[1] : null }
const clusterKey = id => { const m = id.match(RE_CLUSTER_ID); return m ? m[1] : null }

// Supported types — the author's own id survives into the rendered id.
assert.equal(nodeKey('mermaid-1786681998933-flowchart-auth-0'), 'auth')   // graph / flowchart
assert.equal(nodeKey('mermaid-1786630164967-state-auth-0'), 'auth')       // stateDiagram-v2
assert.equal(nodeKey('mermaid-1786630165035-classId-auth-1'), 'auth')     // classDiagram

// House-style numeric ids still resolve, and N1 must not swallow N10.
assert.equal(nodeKey('mermaid-1786602232448-flowchart-N1-0'), 'N1')
assert.equal(nodeKey('mermaid-1-flowchart-N10-2'), 'N10')

// Greedy capture: an author id that itself ends in digits must survive whole.
assert.equal(nodeKey('mermaid-1-flowchart-step-2-0'), 'step-2')
// ...and one containing dashes.
assert.equal(nodeKey('mermaid-1-flowchart-my-node-3'), 'my-node')

// Subgraphs: no type prefix, no numeric suffix, just the per-render stamp.
assert.equal(clusterKey('mermaid-1786681998933-boot'), 'boot')
assert.equal(clusterKey('mermaid-1-config-resolution'), 'config-resolution')

// Deliberately excluded: addressable, but mermaid 11.15 rejects entity
// aliases, so the box would show the raw id and never the name.
assert.equal(nodeKey('mermaid-1786630165006-entity-N1-0'), null)

// No author id in the DOM at all — matching these would be positional.
assert.equal(nodeKey('actor0'), null)                        // sequenceDiagram
assert.equal(nodeKey('mermaid-1786630165126-node_0'), null)  // mermaid mindmap
assert.equal(nodeKey('mermaid-1786630165204-task0'), null)   // journey

// Edge ids embed node names — they must never be mistaken for nodes.
assert.equal(nodeKey('mermaid-1786602232448-L_N1_N2_0'), null)

// ── lookupHeading — id first, section number as fallback ─────────────────────
{
  const byKey = new Map([['auth', 'H_auth'], ['3', 'H_three'], ['N4', 'H_literalN4']])

  // Explicit {#id} anchor wins.
  assert.equal(lookupHeading(byKey, 'auth'), 'H_auth')

  // House style: node `N3` finds `### 3. …` even though no heading says "N3".
  // This is what keeps every pre-existing document working untouched.
  assert.equal(lookupHeading(byKey, 'N3'), 'H_three')

  // An exact key beats the numeric fallback.
  assert.equal(lookupHeading(byKey, 'N4'), 'H_literalN4')

  // Fail-soft both ways: unknown id, and a number nobody declared.
  assert.equal(lookupHeading(byKey, 'nope'), undefined)
  assert.equal(lookupHeading(byKey, 'N9'), undefined)
}

console.log('✓ pairing keys: 19 checks passed')
