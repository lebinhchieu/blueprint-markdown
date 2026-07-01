/**
 * mountMindmap.ts — mounts a Cytoscape + dagre graph into an `.em-mindmap`
 * placeholder and wires the click → detail-drawer interaction.
 *
 * Mirrors the mermaid mount pattern in previewRuntime.ts: the directive
 * renders an empty, sized container server-side; this runs client-side
 * (after DOM insert) to build the actual graph.
 *
 * Cytoscape style values can't reference CSS custom properties directly, so
 * colors are resolved once via getComputedStyle and baked into node/edge
 * data (same approach renderMermaid uses for its theme variables).
 */

import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import cytoscapeDagre from 'cytoscape-dagre'
import type { MindmapGraph, MindmapNode } from './parseMindmap'

let dagreRegistered = false
function ensureDagreRegistered(): void {
  if (dagreRegistered) return
  cytoscape.use(cytoscapeDagre)
  dagreRegistered = true
}

export interface MountMindmapOptions {
  /** Render a node's raw markdown body to HTML (drawer content). */
  renderBody: (markdown: string) => string
}

export interface MindmapHandle {
  cy: Core
  destroy(): void
}

const TYPE_COLOR_VARS: Record<string, [cssVar: string, fallback: string]> = {
  context:  ['--c-danger',  '#b83030'],
  solution: ['--c-info',    '#2a5f7a'],
  detail:   ['--c-success', '#3a7a4e'],
  root:     ['--c-gray',    '#7a6954'],
}

function resolveThemeColors(el: HTMLElement) {
  const css = getComputedStyle(el)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const typeColors: Record<string, string> = {}
  for (const [type, [cssVar, fallback]] of Object.entries(TYPE_COLOR_VARS)) {
    typeColors[type] = read(cssVar, fallback)
  }
  return {
    typeColors,
    textOnSolid: read('--text-on-solid', '#ffffff'),
    edgeColor: read('--border-color', '#ddd4c4'),
    // Cytoscape's font-family parser rejects quotes and multi-fallback CSS
    // stacks (unlike a browser's own CSS engine) — keep this comma-separated
    // and unquoted.
    fontFamily: 'DM Sans, sans-serif',
  }
}

function truncateLabel(label: string, maxWords = 6): string {
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return label
  return words.slice(0, maxWords).join(' ') + '…'
}

function buildDrawer(container: HTMLElement): {
  panel: HTMLElement
  title: HTMLElement
  body: HTMLElement
  close(): void
} {
  const panel = document.createElement('div')
  panel.className = 'em-mindmap__drawer'

  const header = document.createElement('div')
  header.className = 'em-mindmap__drawer-header'

  const title = document.createElement('div')
  title.className = 'em-mindmap__drawer-title'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'em-mindmap__drawer-close'
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.textContent = '×'

  const body = document.createElement('div')
  body.className = 'em-mindmap__drawer-body'

  header.appendChild(title)
  header.appendChild(closeBtn)
  panel.appendChild(header)
  panel.appendChild(body)
  container.appendChild(panel)

  function close(): void {
    panel.classList.remove('is-open')
  }
  closeBtn.addEventListener('click', close)

  return { panel, title, body, close }
}

/**
 * Mount a mindmap graph into `container` (an `.em-mindmap` placeholder).
 * Replaces any existing content — safe to call again on remount.
 */
export function mountMindmap(
  container: HTMLElement,
  graph: MindmapGraph,
  options: MountMindmapOptions,
): MindmapHandle {
  ensureDagreRegistered()
  container.innerHTML = ''

  const canvas = document.createElement('div')
  canvas.className = 'em-mindmap__canvas'
  container.appendChild(canvas)

  const drawer = buildDrawer(container)
  const nodeById = new Map<string, MindmapNode>(graph.nodes.map(n => [n.id, n]))
  const { typeColors, textOnSolid, edgeColor, fontFamily } = resolveThemeColors(container)

  const elements: ElementDefinition[] = [
    ...graph.nodes.map(n => ({
      data: {
        id: n.id,
        label: n.type === 'root' ? '' : truncateLabel(n.label),
        color: typeColors[n.type] ?? typeColors.detail,
      },
      classes: n.type === 'root' ? 'em-mindmap-root' : undefined,
    })),
    ...graph.edges.map((e, i) => ({
      data: { id: `e${i}`, source: e.source, target: e.target, kind: e.kind },
    })),
  ]

  const cy = cytoscape({
    container: canvas,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          shape: 'round-rectangle',
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',
          'text-max-width': '140px',
          'font-family': fontFamily,
          'font-size': 13,
          color: textOnSolid,
          padding: '10px',
          width: 'label',
          height: 'label',
          'background-color': 'data(color)',
          'border-width': 0,
        },
      },
      {
        selector: '.em-mindmap-root',
        style: { width: 1, height: 1, opacity: 0, events: 'no' },
      },
      {
        selector: 'edge',
        style: {
          width: 2,
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'line-color': edgeColor,
          'target-arrow-color': edgeColor,
        },
      },
      {
        selector: 'edge[kind = "link"]',
        style: { 'line-style': 'dashed' },
      },
    ],
    layout: { name: 'dagre', rankDir: 'LR', nodeSep: 24, rankSep: 70 } as cytoscape.LayoutOptions,
    minZoom: 0.2,
    maxZoom: 2.5,
  })

  function openDrawer(node: MindmapNode): void {
    drawer.title.textContent = node.label
    drawer.body.innerHTML = node.body ? options.renderBody(node.body) : ''
    drawer.panel.classList.add('is-open')
  }

  cy.on('tap', 'node', evt => {
    const id = evt.target.id()
    const node = nodeById.get(id)
    if (node && node.type !== 'root') openDrawer(node)
  })
  cy.on('tap', evt => {
    if (evt.target === cy) drawer.close()
  })

  return {
    cy,
    destroy() {
      cy.destroy()
      container.innerHTML = ''
    },
  }
}
