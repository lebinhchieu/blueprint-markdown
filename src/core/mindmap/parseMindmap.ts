/**
 * parseMindmap.ts — heading-tree markdown → {nodes, edges} graph model.
 *
 * Input is the raw markdown body of a `:::mindmap` block (plain text, not the
 * AST). Heading level = tree depth; the content under a heading up to the
 * next heading of equal-or-shallower depth is that node's body. `[[id]]`
 * anywhere in a body becomes a dashed cross-link edge to that node.
 *
 * See mindmap-design.md §2–3 for the authoring format and data model.
 */

import { parseAttrs } from '../attrs'

export type MindmapNodeType = 'context' | 'solution' | 'detail' | string

export interface MindmapNode {
  id: string
  type: MindmapNodeType
  label: string
  body: string
}

export interface MindmapEdge {
  source: string
  target: string
  kind: 'tree' | 'link'
}

export interface MindmapGraph {
  nodes: MindmapNode[]
  edges: MindmapEdge[]
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const TRAILING_ATTRS_RE = /\s*\{([^}]*)\}\s*$/
const CROSS_LINK_RE = /\[\[([\w-]+)\]\]/g

function typeForDepth(depth: number): MindmapNodeType {
  if (depth === 1) return 'context'
  if (depth === 2) return 'solution'
  return 'detail'
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'node'
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

interface FenceMarker {
  char: string
  len: number
}

function matchFence(line: string): FenceMarker | null {
  const m = line.match(/^(\s*)(```+|~~~+)/)
  if (!m) return null
  return { char: m[2][0], len: m[2].length }
}

interface HeadingLine {
  depth: number
  label: string
  id?: string
  type?: string
}

function parseHeadingLine(line: string): HeadingLine | null {
  const m = line.match(HEADING_RE)
  if (!m) return null
  const depth = m[1].length
  let text = m[2].trim()

  let id: string | undefined
  let type: string | undefined
  const attrMatch = text.match(TRAILING_ATTRS_RE)
  if (attrMatch) {
    const attrs = parseAttrs(attrMatch[1])
    id = attrs.id
    type = attrs.named['type']
    text = text.slice(0, attrMatch.index).trim()
  }

  return { depth, label: text, id, type }
}

/**
 * Parse the raw markdown body of a `:::mindmap` block into a graph.
 * Never throws; malformed input degrades gracefully (fail-soft).
 */
export function parseMindmap(source: string): MindmapGraph {
  const lines = source.split('\n')
  const nodes: MindmapNode[] = []
  const usedIds = new Set<string>()
  // Stack of ancestors still open, shallowest first.
  const stack: Array<{ id: string; depth: number }> = []
  const treeEdges: MindmapEdge[] = []
  const topLevelIds: string[] = []

  let inFence = false
  let fenceMarker: FenceMarker | null = null
  let currentNode: MindmapNode | null = null
  let bodyLines: string[] = []

  function flushBody(): void {
    if (currentNode) currentNode.body = bodyLines.join('\n').trim()
    bodyLines = []
  }

  for (const line of lines) {
    const fm = matchFence(line)
    if (!inFence && fm) {
      inFence = true
      fenceMarker = fm
      bodyLines.push(line)
      continue
    }
    if (inFence) {
      if (fm && fm.char === fenceMarker!.char && fm.len >= fenceMarker!.len) {
        inFence = false
        fenceMarker = null
      }
      bodyLines.push(line)
      continue
    }

    const heading = parseHeadingLine(line)
    if (!heading) {
      bodyLines.push(line)
      continue
    }

    flushBody()

    while (stack.length && stack[stack.length - 1].depth >= heading.depth) stack.pop()
    const parent = stack[stack.length - 1]

    const id = uniqueId(heading.id ?? slugify(heading.label), usedIds)
    usedIds.add(id)
    const node: MindmapNode = {
      id,
      type: heading.type ?? typeForDepth(heading.depth),
      label: heading.label,
      body: '',
    }
    nodes.push(node)
    currentNode = node

    if (parent) {
      treeEdges.push({ source: parent.id, target: id, kind: 'tree' })
    } else {
      topLevelIds.push(id)
    }
    stack.push({ id, depth: heading.depth })
  }
  flushBody()

  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const edges: MindmapEdge[] = [...treeEdges]
  if (topLevelIds.length > 1) {
    const root: MindmapNode = { id: '__root__', type: 'root', label: '', body: '' }
    nodes.unshift(root)
    for (const id of topLevelIds) edges.unshift({ source: '__root__', target: id, kind: 'tree' })
  }

  // Cross-links: [[id]] in any body → dashed edge, unknown ids ignored (fail-soft).
  const linkSeen = new Set<string>()
  for (const node of nodes) {
    for (const match of node.body.matchAll(CROSS_LINK_RE)) {
      const targetId = match[1]
      if (targetId === node.id || !usedIds.has(targetId)) continue
      const key = `${node.id}->${targetId}`
      if (linkSeen.has(key)) continue
      linkSeen.add(key)
      edges.push({ source: node.id, target: targetId, kind: 'link' })
    }
  }

  return { nodes, edges }
}
