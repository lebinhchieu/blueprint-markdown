#!/usr/bin/env node
/**
 * validate.mjs — standalone blueprint-markdown directive validator
 *
 * Usage:  node validate.mjs <file.md>
 *
 * Runs with plain `node` — zero dependencies, no npm, no esbuild, no repo src/.
 * Copy this file alongside any .md files you want to check.
 *
 * Catches the "silent failure" cases where a malformed block directive renders
 * as plain text with no visible error in the preview:
 *   • Unclosed containers (:::name with no closing :::)
 *   • Unknown directive names (typos, unregistered names)
 *   • Wrong form (e.g. :::progress when only :: is valid)
 *   • Near-miss lines (::: card with space, ::::card with four colons, etc.)
 *
 * NOT checked: inline directives (:name[text]{attrs}) intentionally stay in
 * text runs and require a render-path check to validate — out of scope here.
 */

import { readFileSync } from 'fs'
import { basename } from 'path'

// ─── Registry (baked — keep in sync with src/core/directives/) ───────────────
// Update this map whenever you add or remove a directive from the registry.
// Form values match DirectiveSpec.forms: 'container' | 'leaf' | 'inline'

const REGISTRY = {
  // card.ts
  card:      ['container'],
  cards:     ['container'],
  // callout.ts — named aliases all use the same container form
  callout:   ['container'],
  note:      ['container'],
  tip:       ['container'],
  info:      ['container'],
  warning:   ['container'],
  danger:    ['container'],
  success:   ['container'],
  // disclosure.ts
  details:   ['container'],
  accordion: ['container'],
  // layout.ts
  columns:   ['container'],
  col:       ['container'],
  // timeline.ts
  timeline:  ['container'],
  event:     ['container'],
  // tabs.ts
  tabs:      ['container'],
  tab:       ['container'],
  // steps.ts
  steps:     ['container'],
  step:      ['container'],
  // progress.ts
  progress:  ['leaf'],
  // revision.ts
  revision:  ['container'],
  previous:  ['container'],
  // mindmap.ts — body is plain heading markdown, not nested directives
  mindmap:   ['container'],
  // inline-widgets.ts (listed for near-miss context only — not block-checked)
  chip:      ['inline'],
  icon:      ['inline'],
  color:     ['inline'],
  kbd:       ['inline'],
  button:    ['inline'],
  tooltip:   ['inline'],
  rating:    ['inline'],
  comment:   ['inline'],
  ai:        ['inline'],
}

// ─── Parser — ported from src/core/parser.ts (exact regexes, same logic) ─────
// Colon count is the grammar:
//   :::name{attrs} = container OPEN   (closes with :::)
//   :::            = container CLOSE
//   ::name{attrs}  = leaf block (progress only)
//   :name[…]{…}    = inline — stays in text runs, NOT classified here

const RE_CLOSE = /^\s*:::\s*$/
const RE_OPEN  = /^\s*:::([A-Za-z][\w-]*)(\{(?:"(?:\\.|[^"\\])*"|[^{}"])*\})?\s*$/
const RE_LEAF  = /^\s*::([A-Za-z][\w-]*)(\{(?:"(?:\\.|[^"\\])*"|[^{}"])*\})?\s*$/

function classifyLine(line) {
  if (RE_CLOSE.test(line)) return { kind: 'CLOSE' }
  const m3 = line.match(RE_OPEN)
  if (m3) return { kind: 'OPEN', name: m3[1] }
  const m2 = line.match(RE_LEAF)
  if (m2) return { kind: 'LEAF', name: m2[1] }
  return { kind: 'TEXT' }
}

function matchFence(line) {
  const m = line.match(/^(\s*)(```+|~~~+)/)
  if (!m) return null
  return { char: m[2][0], len: m[2].length }
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {boolean} stopAtClose
 * @returns {{ nodes: object[], nextIndex: number, closedByFence: boolean }}
 */
function parseBlock(lines, start, stopAtClose) {
  const nodes = []
  let textLines = []
  let i = start
  let inFence = false
  let fenceMarker = null

  function flushText() {
    if (textLines.length > 0) {
      nodes.push({ type: 'text', lines: textLines })
      textLines = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fence state machine
    const fm = matchFence(line)
    if (!inFence && fm) {
      inFence = true
      fenceMarker = fm
      textLines.push(line)
      i++
      continue
    }
    if (inFence) {
      if (fm && fm.char === fenceMarker.char && fm.len >= fenceMarker.len) {
        inFence = false
        fenceMarker = null
      }
      textLines.push(line)
      i++
      continue
    }

    const cls = classifyLine(line)

    if (cls.kind === 'CLOSE') {
      if (stopAtClose) {
        flushText()
        return { nodes, nextIndex: i + 1, closedByFence: true }
      }
      textLines.push(line)
      i++
      continue
    }

    if (cls.kind === 'OPEN') {
      flushText()
      const inner = parseBlock(lines, i + 1, true)
      nodes.push({
        type: 'directive', form: 'container', name: cls.name,
        children: inner.nodes, closed: inner.closedByFence,
      })
      i = inner.nextIndex
      continue
    }

    if (cls.kind === 'LEAF') {
      flushText()
      nodes.push({ type: 'directive', form: 'leaf', name: cls.name, closed: true })
      i++
      continue
    }

    textLines.push(line)
    i++
  }

  flushText()
  return { nodes, nextIndex: i, closedByFence: false }
}

function parseBlocks(source) {
  return parseBlock(source.split('\n'), 0, false).nodes
}

// ─── Validation ───────────────────────────────────────────────────────────────

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node validate.mjs <file.md>')
  process.exit(1)
}

let src
try {
  src = readFileSync(filePath, 'utf8')
} catch (err) {
  console.error(`Cannot read file: ${filePath}\n${err.message}`)
  process.exit(1)
}

const rawLines = src.split('\n')

// Build line-number index: "name:form" → first line number seen (for error annotations)
const firstLine = new Map()
rawLines.forEach((line, i) => {
  const m3 = line.match(/^\s*:::([A-Za-z][\w-]*)/)
  if (m3 && !RE_CLOSE.test(line)) {
    const k = `${m3[1]}:container`
    if (!firstLine.has(k)) firstLine.set(k, i + 1)
  }
  const m2 = line.match(/^\s*::([A-Za-z][\w-]*)/)
  if (m2 && !/^\s*:::/.test(line)) {
    const k = `${m2[1]}:leaf`
    if (!firstLine.has(k)) firstLine.set(k, i + 1)
  }
})

function lineHint(name, form) {
  const ln = firstLine.get(`${name}:${form}`)
  return ln != null ? ` (line ${ln})` : ''
}

// Walk AST
const errors = []

function walk(nodes) {
  for (const node of nodes) {
    if (node.type !== 'directive') continue

    if (node.closed === false) {
      errors.push(`Unclosed container :::${node.name}${lineHint(node.name, 'container')} — missing closing :::`)
    }

    const forms = REGISTRY[node.name]
    if (!forms) {
      errors.push(`Unknown directive "${node.name}"${lineHint(node.name, node.form)} — typo or unregistered name`)
    } else if (!forms.includes(node.form)) {
      errors.push(
        `"${node.name}"${lineHint(node.name, node.form)} used as ${node.form} ` +
        `but only supports: ${forms.join(', ')}`
      )
    }

    if (node.children) walk(node.children)
  }
}

walk(parseBlocks(src))

// Near-miss scan: lines that look like directives but failed the parser regexes
const RE_NEAR_SPACE_3 = /^\s*:::\s+[A-Za-z]/   // ::: card
const RE_NEAR_FOUR    = /^\s*::::[A-Za-z]/       // ::::card
const RE_NEAR_SPACE_2 = /^\s*::\s+[A-Za-z]/     // :: progress

const warnings = []
rawLines.forEach((line, i) => {
  if (RE_NEAR_SPACE_3.test(line))
    warnings.push(`Line ${i + 1}: space after ::: — "${line.trim()}"`)
  else if (RE_NEAR_FOUR.test(line))
    warnings.push(`Line ${i + 1}: four colons :::: — "${line.trim()}"`)
  else if (RE_NEAR_SPACE_2.test(line))
    warnings.push(`Line ${i + 1}: space after :: — "${line.trim()}"`)
})

// ─── Report ───────────────────────────────────────────────────────────────────

const label = basename(filePath)

if (warnings.length) {
  console.warn(`\n⚠  Near-misses in ${label} (parsed as plain text, not directives):`)
  warnings.forEach(w => console.warn(`   ${w}`))
}

if (errors.length) {
  console.error(`\n✗  Errors in ${label}:`)
  errors.forEach(e => console.error(`   ${e}`))
  console.error(`\n   ${errors.length} error(s). Fix and re-run.`)
  console.error('   Note: inline :name[text] directives are not checked here.')
  process.exit(1)
}

if (!warnings.length) {
  console.log(`✓  ${label}: block directives OK`)
} else {
  console.log(`✓  ${label}: no errors (${warnings.length} near-miss warning(s) above)`)
}
console.log('   Note: inline :name[text] directives are not checked here.')
