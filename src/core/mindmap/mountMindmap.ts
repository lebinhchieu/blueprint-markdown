/**
 * mountMindmap.ts — mounts a Cytoscape + dagre graph into an `.em-mindmap`
 * placeholder and wires interaction: click → detail-drawer, hover (after a
 * short dwell) → path isolation, double-click → reset to fit view,
 * right-click → collapse/expand subtree, layout switch (dagre ↔ concentric).
 *
 * Mirrors the mermaid mount pattern in previewRuntime.ts: the directive
 * renders an empty, sized container server-side; this runs client-side
 * (after DOM insert) to build the actual graph.
 *
 * Cytoscape style values can't reference CSS custom properties directly, so
 * colors are resolved once via getComputedStyle and baked into node/edge
 * data (same approach renderMermaid uses for its theme variables).
 *
 * `cytoscape`/`cytoscape-dagre` are accepted as parameters (never imported as
 * values here) so this module can be bundled without pulling the libraries
 * in — mirrors how previewRuntime.ts takes a MermaidApi parameter.
 * - preview.ts        passes its statically-bundled cytoscape + cytoscape-dagre.
 * - exportClient.ts   passes window.cytoscape / window.cytoscapeDagre (CDN), or undefined.
 */

import type {
  Core,
  ElementDefinition,
  EventObjectCore,
  EventObjectNode,
  LayoutOptions,
  NodeSingular,
  Position,
} from 'cytoscape'
import type { MindmapGraph, MindmapNode } from './parseMindmap'

export type CytoscapeLib = typeof import('cytoscape')
export type CytoscapeDagreLib = typeof import('cytoscape-dagre')

let dagreRegistered = false
function ensureDagreRegistered(cytoscape: CytoscapeLib, cytoscapeDagre: CytoscapeDagreLib): void {
  if (dagreRegistered) return
  cytoscape.use(cytoscapeDagre)
  dagreRegistered = true
}

export type MindmapLayoutName = 'dagre' | 'concentric'

export interface MountMindmapOptions {
  /** Render a node's raw markdown body to HTML (drawer content). */
  renderBody: (markdown: string) => string
}

export interface MindmapHandle {
  cy: Core
  /** Switch between the default layered layout and a concentric one. */
  setLayout(name: MindmapLayoutName): void
  /** Re-fit the whole graph in the viewport. */
  fit(): void
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
    linkColor: read('--c-low', '#caa000'),
    primaryColor: read('--c-primary', '#c05a28'),
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

const TREE_EDGE_SELECTOR = 'edge[kind = "tree"]'

/**
 * Immediate tree-parent of a node, if any.
 *
 * Cytoscape's own `predecessors(selector)`/`successors(selector)` traverse
 * *all* edges regardless of the selector and only filter the accumulated
 * result at the very end — so restricting to `edge[kind="tree"]` strips out
 * every node element too (a node never matches an edge selector), leaving
 * `.nodes()` always empty. One-hop `incomers`/`outgoers` have the same
 * filter-at-the-end behavior, but `.sources()`/`.targets()` on the
 * surviving (correctly tree-only) edges still recovers the right nodes —
 * so tree-only multi-hop walks are built manually from that one-hop step.
 */
function treeParent(node: NodeSingular): NodeSingular | undefined {
  const parents = node.incomers(TREE_EDGE_SELECTOR).sources()
  return parents.empty() ? undefined : parents[0]
}

/** Depth of each node from its root, following tree edges only (BFS). */
function computeTreeDepths(cy: Core): Map<string, number> {
  const depths = new Map<string, number>()
  const roots = cy.nodes().filter(n => n.hasClass('em-mindmap-root') || treeParent(n) === undefined)
  const queue: NodeSingular[] = []
  roots.forEach(r => {
    depths.set(r.id(), 0)
    queue.push(r)
  })
  while (queue.length) {
    const node = queue.shift()!
    const depth = depths.get(node.id())!
    node.outgoers(TREE_EDGE_SELECTOR).targets().forEach(child => {
      if (!depths.has(child.id())) {
        depths.set(child.id(), depth + 1)
        queue.push(child)
      }
    })
  }
  return depths
}

const DAGRE_LAYOUT = {
  name: 'dagre',
  animate: true,
  animationDuration: 150,
  rankDir: 'LR',
  nodeSep: 24,
  rankSep: 70,
} as LayoutOptions

function layoutOptions(name: MindmapLayoutName, cy: Core): LayoutOptions {
  if (name === 'concentric') {
    const depths = computeTreeDepths(cy)
    return {
      name: 'concentric',
      animate: true,
      animationDuration: 150,
      spacingFactor: 0.6,
      minNodeSpacing: 16,
      avoidOverlap: true,
      concentric: (node: NodeSingular) => -(depths.get(node.id()) ?? 0),
      levelWidth: () => 1,
    } as LayoutOptions
  }
  return DAGRE_LAYOUT
}

/**
 * Mount a mindmap graph into `container` (an `.em-mindmap` placeholder).
 * Replaces any existing content — safe to call again on remount.
 */
export function mountMindmap(
  cytoscape: CytoscapeLib,
  cytoscapeDagre: CytoscapeDagreLib,
  container: HTMLElement,
  graph: MindmapGraph,
  options: MountMindmapOptions,
): MindmapHandle {
  ensureDagreRegistered(cytoscape, cytoscapeDagre)
  container.innerHTML = ''

  const canvas = document.createElement('div')
  canvas.className = 'em-mindmap__canvas'
  container.appendChild(canvas)

  const drawer = buildDrawer(container)
  const nodeById = new Map<string, MindmapNode>(graph.nodes.map(n => [n.id, n]))
  const { typeColors, textOnSolid, edgeColor, linkColor, primaryColor, fontFamily } = resolveThemeColors(container)

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
          'transition-property': 'opacity',
          'transition-duration': 100,
        },
      },
      {
        // Only present when parseMindmap had to merge 2+ real roots under one
        // virtual root (see §9 "Multiple roots" in mindmap-design.md) — shown
        // as a small dot so the shared origin reads clearly on screen.
        selector: '.em-mindmap-root',
        style: {
          shape: 'ellipse',
          width: 14,
          height: 14,
          padding: '0px',
          'background-color': 'data(color)',
          'border-width': 0,
          events: 'no',
        },
      },
      {
        selector: '.em-mindmap-collapsed',
        style: {
          'border-width': 3,
          'border-style': 'dashed',
          'border-color': primaryColor,
          'border-opacity': 0.8,
        },
      },
      {
        selector: '.em-mindmap-faded',
        style: { opacity: 0.15 },
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
          'transition-property': 'opacity',
          'transition-duration': 100,
        },
      },
      {
        // Cross-links (`[[id]]` references) get their own color, distinct
        // from tree edges, so the two relationship kinds read apart at a
        // glance without relying on animation.
        selector: 'edge[kind = "link"]',
        style: {
          'line-style': 'dashed',
          'line-dash-pattern': [6, 4],
          'line-color': linkColor,
          'target-arrow-color': linkColor,
        },
      },
      {
        selector: 'edge.em-mindmap-faded',
        style: { opacity: 0.08 },
      },
    ],
    layout: DAGRE_LAYOUT,
    minZoom: 0.2,
    maxZoom: 2.5,
    wheelSensitivity: 5
  })

  let currentLayout: MindmapLayoutName = 'dagre'
  const collapsed = new Set<string>()

  // ─── Hover: upstream/downstream path isolation ───────────────────────────
  // Only triggers once the pointer dwells on a node for a beat, so a fast
  // mouse pass-over doesn't flash the fade on every node along the way.
  const HOVER_DWELL_MS = 250
  let hoverTimer: number | undefined

  cy.on('mouseover', 'node', (evt: EventObjectNode) => {
    const node = evt.target
    if (node.hasClass('em-mindmap-root')) return
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(() => {
      const related = node.union(node.successors()).union(node.predecessors())
      cy.elements().difference(related).addClass('em-mindmap-faded')
    }, HOVER_DWELL_MS)
  })
  cy.on('mouseout', 'node', () => {
    window.clearTimeout(hoverTimer)
    cy.elements().removeClass('em-mindmap-faded')
  })

  // ─── Click: open detail drawer + focus-lock ───────────────────────────────
  let savedViewport: { pan: Position; zoom: number } | null = null

  function focusNode(node: NodeSingular): void {
    if (!savedViewport) savedViewport = { pan: { ...cy.pan() }, zoom: cy.zoom() }
    const drawerWidth = drawer.panel.getBoundingClientRect().width || 340
    const zoom = cy.zoom()
    const pos = node.position()
    const visibleCenterX = (canvas.clientWidth - drawerWidth) / 2
    cy.animate(
      { pan: { x: visibleCenterX - pos.x * zoom, y: canvas.clientHeight / 2 - pos.y * zoom } },
      { duration: 150, easing: 'ease-in-out' },
    )
  }

  function openDrawer(node: MindmapNode): void {
    drawer.title.textContent = node.label
    drawer.body.innerHTML = node.body ? options.renderBody(node.body) : ''
    drawer.panel.classList.add('is-open')
    focusNode(cy.$id(node.id))
  }

  cy.on('tap', 'node', (evt: EventObjectNode) => {
    const id = evt.target.id()
    const node = nodeById.get(id)
    if (node && node.type !== 'root') openDrawer(node)
  })
  cy.on('tap', (evt: EventObjectCore) => {
    if (evt.target === cy) {
      drawer.close()
      if (savedViewport) {
        cy.animate({ pan: savedViewport.pan, zoom: savedViewport.zoom }, { duration: 150 })
        savedViewport = null
      }
    }
  })

  // ─── Double-click: reset to fit view ──────────────────────────────────────
  function fitView(): void {
    savedViewport = null
    cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 150 })
  }
  cy.on('dbltap', () => fitView())

  // ─── Right-click: collapse / expand subtree ───────────────────────────────
  function hasCollapsedAncestor(node: NodeSingular): boolean {
    for (let p = treeParent(node); p; p = treeParent(p)) {
      if (collapsed.has(p.id())) return true
    }
    return false
  }

  function applyCollapsedVisibility(): void {
    cy.nodes().forEach(n => {
      if (n.hasClass('em-mindmap-root')) return
      n.style('display', hasCollapsedAncestor(n) ? 'none' : 'element')
    })
    cy.edges().forEach(e => {
      const hidden = e.source().style('display') === 'none' || e.target().style('display') === 'none'
      e.style('display', hidden ? 'none' : 'element')
    })
  }

  cy.on('cxttap', 'node', (evt: EventObjectNode) => {
    const node = evt.target
    const id = node.id()
    if (node.hasClass('em-mindmap-root')) return
    if (node.outgoers(TREE_EDGE_SELECTOR).empty()) return // leaf — nothing to collapse
    if (collapsed.has(id)) {
      collapsed.delete(id)
      node.removeClass('em-mindmap-collapsed')
    } else {
      collapsed.add(id)
      node.addClass('em-mindmap-collapsed')
    }
    applyCollapsedVisibility()
    cy.layout(layoutOptions(currentLayout, cy)).run()
  })

  return {
    cy,
    setLayout(name: MindmapLayoutName) {
      if (name === currentLayout) return
      currentLayout = name
      cy.layout(layoutOptions(name, cy)).run()
    },
    fit() {
      fitView()
    },
    destroy() {
      window.clearTimeout(hoverTimer)
      cy.destroy()
      container.innerHTML = ''
    },
  }
}
