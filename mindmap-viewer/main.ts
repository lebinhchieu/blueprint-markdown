/**
 * main.ts — standalone mindmap viewer entry point.
 *
 * Reuses the real parser/mount modules from src/core/ unchanged, so this
 * harness proves the exact code that will later be wired into the
 * blueprint-markdown extension's :::mindmap directive.
 */

import { parseBlocks, type TextNode } from '../src/core/parser'
import { parseMindmap } from '../src/core/mindmap/parseMindmap'
import { mountMindmap } from '../src/core/mindmap/mountMindmap'
import { createBrowserMarkdownIt } from '../src/core/markdownitBrowser'
import SAMPLE_MD from './sample.md'

const md = createBrowserMarkdownIt()

function extractMindmapSource(markdown: string): string | null {
  const ast = parseBlocks(markdown)
  const node = ast.find(n => n.type === 'directive' && n.name === 'mindmap')
  if (!node || node.type !== 'directive' || !node.children) return null
  return node.children
    .filter((n): n is TextNode => n.type === 'text')
    .map(n => n.lines.join('\n'))
    .join('\n')
}

function render(markdown: string): void {
  const status = document.getElementById('status')!
  const root = document.getElementById('mindmap-root')!

  const source = extractMindmapSource(markdown)
  if (source === null) {
    status.textContent = 'No :::mindmap block found in this file.'
    root.innerHTML = ''
    return
  }

  const graph = parseMindmap(source)
  if (graph.nodes.length === 0) {
    status.textContent = 'The :::mindmap block has no headings to render.'
    root.innerHTML = ''
    return
  }

  status.textContent = `${graph.nodes.length} nodes, ${graph.edges.length} edges`
  mountMindmap(root, graph, {
    renderBody: (bodyMd: string) => md.render(bodyMd),
  })
}

function readFile(file: File): void {
  const reader = new FileReader()
  reader.onload = () => render(String(reader.result ?? ''))
  reader.readAsText(file)
}

const dropZone = document.getElementById('drop-zone')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const sampleBtn = document.getElementById('load-sample')!

dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('is-dragover')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('is-dragover')
  const file = e.dataTransfer?.files?.[0]
  if (file) readFile(file)
})
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) readFile(file)
})
sampleBtn.addEventListener('click', () => render(SAMPLE_MD))

render(SAMPLE_MD)
