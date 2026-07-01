/**
 * mountMindmap.ts — mounts a Cytoscape + dagre graph into an `.em-mindmap`
 * placeholder and wires interaction: click → detail-drawer (opens on the
 * left instead of the right if the node would otherwise sit underneath it),
 * hover (after a short dwell) → path isolation, double-click → reset to fit
 * view, right-click → collapse/expand subtree, layout switch
 * (dagre ↔ concentric). Scroll-to-zoom is disabled until the mindmap is
 * clicked into, so scrolling the page over it doesn't hijack the scroll.
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

// Node fill palette, cycled by index — see colorForNode(). `--c-gray` is
// reserved for the synthetic multi-root node so it reads as structural,
// not a group.
const NODE_COLOR_PALETTE: Array<[cssVar: string, fallback: string]> = [
  ['--c-danger',  '#b83030'],
  ['--c-info',    '#2a5f7a'],
  ['--c-success', '#3a7a4e'],
  ['--c-warning', '#b07220'],
  ['--c-low',     '#caa000'],
  ['--c-primary', '#c05a28'],
]
const ROOT_COLOR_VAR: [cssVar: string, fallback: string] = ['--c-gray', '#7a6954']

function resolveThemeColors(el: HTMLElement) {
  const css = getComputedStyle(el)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    palette: NODE_COLOR_PALETTE.map(([cssVar, fallback]) => read(cssVar, fallback)),
    rootColor: read(ROOT_COLOR_VAR[0], ROOT_COLOR_VAR[1]),
    textOnSolid: read('--text-on-solid', '#ffffff'),
    edgeColor: read('--border-color', '#ddd4c4'),
    arrowColor: read('--text-muted', '#7a6954'),
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
  closeBtn: HTMLButtonElement
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

  return { panel, title, body, closeBtn }
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
  const { palette, rootColor, textOnSolid, edgeColor, arrowColor, linkColor, primaryColor, fontFamily } =
    resolveThemeColors(container)

  // Groups nodes by color: same `type` always gets the same color, assigned
  // by the order distinct types first appear. Untyped nodes fall back to
  // their heading level instead (`#` = index 0), so a plain, type-less
  // mindmap still gets depth-varied colors.
  const typeOrder: string[] = []
  function colorForNode(n: MindmapNode): string {
    if (n.type === 'root') return rootColor
    let index: number
    if (n.type) {
      index = typeOrder.indexOf(n.type)
      if (index === -1) {
        index = typeOrder.length
        typeOrder.push(n.type)
      }
    } else {
      index = n.level - 1
    }
    return palette[index % palette.length]
  }

  const elements: ElementDefinition[] = [
    ...graph.nodes.map(n => ({
      data: {
        id: n.id,
        label: n.type === 'root' ? '' : truncateLabel(n.label),
        color: colorForNode(n),
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
          'target-arrow-color': arrowColor,
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

  // ─── Scroll-to-zoom only once the mindmap is clicked into ─────────────────
  // Otherwise scrolling the page over the mindmap hijacks the scroll as zoom.
  cy.userZoomingEnabled(false)
  function activate(): void {
    cy.userZoomingEnabled(true)
  }
  function deactivateIfOutside(evt: MouseEvent): void {
    if (!container.contains(evt.target as Node)) cy.userZoomingEnabled(false)
  }
  container.addEventListener('mousedown', activate)
  document.addEventListener('mousedown', deactivateIfOutside)

  // ─── Hover: upstream/downstream path isolation ───────────────────────────
  // Only triggers once the pointer dwells on a node for a beat, so a fast
  // mouse pass-over doesn't flash the fade on every node along the way.
  const HOVER_DWELL_MS = 250
  let hoverTimer: number | undefined

  cy.on('mouseover', 'node', (evt: EventObjectNode) => {
    const node = evt.target
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

  // ─── Click: open detail drawer ────────────────────────────────────────────
  // Drawer defaults to the right edge; if the clicked node would end up
  // underneath it, the drawer opens on the left instead. If the drawer's
  // width would be disproportionately tall for a short canvas, it opens as a
  // bottom (or top, by the same hidden-node rule) sheet instead, capped at
  // 35% of the canvas height. No viewport panning/zooming happens on open or
  // close. Side changes never happen while the panel is visible — swapping
  // `left`/`right`/`top`/`bottom` isn't itself animatable, so doing that
  // while a `transform` transition is live reads as an instant jump. Instead
  // an already-open drawer slides fully closed first, then reopens on the
  // new side once hidden.
  type DrawerSide = 'right' | 'left' | 'bottom' | 'top'
  const SIDE_CLASS: Record<Exclude<DrawerSide, 'right'>, string> = {
    left: 'em-mindmap__drawer--left',
    bottom: 'em-mindmap__drawer--bottom',
    top: 'em-mindmap__drawer--top',
  }

  let isDrawerOpen = false
  let currentSide: DrawerSide = 'right'
  let pendingCloseTimer: number | undefined

  function computeSide(node: NodeSingular): DrawerSide {
    const canvasW = canvas.clientWidth
    const canvasH = canvas.clientHeight
    const sideWidth = Math.min(340, canvasW * 0.9)
    const box = node.renderedBoundingBox()

    if (sideWidth > canvasW * 0.35) {
      const sheetHeight = Math.min(340, canvasH * 0.35)
      return box.y2 > canvasH - sheetHeight ? 'top' : 'bottom'
    }
    return box.x2 > canvasW - sideWidth ? 'left' : 'right'
  }

  function applySide(side: DrawerSide): void {
    Object.values(SIDE_CLASS).forEach(cls => drawer.panel.classList.remove(cls))
    if (side !== 'right') drawer.panel.classList.add(SIDE_CLASS[side])
    currentSide = side
  }

  // `left`/`right`/`top`/`bottom`/border aren't in `transition-property`, so
  // changing them is instant — but `transform`'s *base* (closed-state) value
  // changes at the same time, and since the `transform` transition is still
  // armed, the browser animates from the OLD side's last transform value to
  // the NEW one anyway. Combined with the anchor having already snapped to
  // the new side, that plays as a brief flash through the middle of the
  // canvas. Disabling the transition for one forced-reflow tick makes the
  // side swap fully instant (harmless — the panel is hidden either way),
  // so the *next* transition (closing further, or opening) always starts
  // from the correct, already-settled hidden position on the new side.
  function setSideIfChanged(side: DrawerSide): void {
    if (side === currentSide) return
    drawer.panel.classList.add('em-mindmap__drawer--notransition')
    applySide(side)
    void drawer.panel.offsetWidth // flush: commit the instant snap before re-enabling transitions
    drawer.panel.classList.remove('em-mindmap__drawer--notransition')
  }

  function renderDrawerContent(node: MindmapNode): void {
    drawer.title.textContent = node.label
    drawer.body.innerHTML = node.body ? options.renderBody(node.body) : ''
  }

  function slideOpen(side: DrawerSide): void {
    setSideIfChanged(side)
    drawer.panel.classList.add('is-open')
    isDrawerOpen = true
  }

  function slideClosed(onDone?: () => void): void {
    if (!isDrawerOpen) {
      onDone?.()
      return
    }
    isDrawerOpen = false
    drawer.panel.classList.remove('is-open')

    let done = false
    const finish = () => {
      if (done) return
      done = true
      drawer.panel.removeEventListener('transitionend', onTransitionEnd)
      window.clearTimeout(pendingCloseTimer)
      onDone?.()
    }
    const onTransitionEnd = (evt: TransitionEvent) => {
      if (evt.target === drawer.panel && evt.propertyName === 'transform') finish()
    }
    drawer.panel.addEventListener('transitionend', onTransitionEnd)
    pendingCloseTimer = window.setTimeout(finish, 200)
  }

  function closeDrawer(): void {
    slideClosed(() => setSideIfChanged('right'))
  }

  function openDrawer(node: MindmapNode): void {
    const side = computeSide(cy.$id(node.id))
    if (isDrawerOpen && side !== currentSide) {
      slideClosed(() => {
        renderDrawerContent(node)
        slideOpen(side)
      })
    } else {
      renderDrawerContent(node)
      slideOpen(side)
    }
  }

  drawer.closeBtn.addEventListener('click', closeDrawer)

  cy.on('tap', 'node', (evt: EventObjectNode) => {
    const id = evt.target.id()
    const node = nodeById.get(id)
    if (node && node.type !== 'root') openDrawer(node)
  })
  cy.on('tap', (evt: EventObjectCore) => {
    if (evt.target === cy) closeDrawer()
  })

  // ─── Double-click: reset to fit view ──────────────────────────────────────
  function fitView(): void {
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
      window.clearTimeout(pendingCloseTimer)
      document.removeEventListener('mousedown', deactivateIfOutside)
      cy.destroy()
      container.innerHTML = ''
    },
  }
}
