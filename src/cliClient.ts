/**
 * cliClient.ts — browser-side script injected (via buildHtml's `extraHead`) into every page
 * the standalone CLI preview serves. Bundled separately from preview.js (VS Code webview) and
 * export-client.js (frozen export snapshot) — see esbuild.mjs's cliClientConfig.
 *
 * Two jobs:
 *   1. Live reload: an SSE connection to /events reloads the page when the server sees the
 *      file change on disk, restoring scroll position across the reload.
 *   2. Comments: right-click → Add/Edit Comment → prompt() → POST /comment. Reuses
 *      commentInsert.ts's selection-tracking unchanged (see its header comment) — the only
 *      new code here is turning that context into a menu and a fetch call, since there's no
 *      VS Code webview relay to go through.
 */

import { lastCommentContext, type CommentContext } from './core/commentInsert'
import './core/commentInsert' // side effect: installs the selectionchange listener

declare global {
  interface Window {
    __blueprintFile: string
  }
}

const FILE = window.__blueprintFile

// ─── Live reload ────────────────────────────────────────────────────────────

const SCROLL_KEY = `blueprint-scroll:${FILE}`
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
})
const savedScroll = sessionStorage.getItem(SCROLL_KEY)
if (savedScroll) window.scrollTo(0, Number(savedScroll))

new EventSource(`/events?f=${encodeURIComponent(FILE)}`).onmessage = () => location.reload()

// ─── Comments ───────────────────────────────────────────────────────────────

function closeMenu(): void {
  document.getElementById('em-comment-menu')?.remove()
}

function promptNote(initial = ''): string | null {
  const note = window.prompt('Comment note', initial)
  if (note === null) return null // Escape
  if (note.includes(']')) {
    window.alert('Note text cannot contain "]"')
    return null
  }
  return note
}

async function postComment(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) window.alert(`Blueprint Markdown: ${await res.text()}`)
  // On success, the file watcher (already running for live reload) picks up the
  // write and pushes the same reload event an editor save would — no extra call here.
}

function showMenu(x: number, y: number, ctx: CommentContext): void {
  closeMenu()
  const menu = document.createElement('div')
  menu.id = 'em-comment-menu'
  menu.style.cssText =
    'position:fixed;z-index:9999;background:var(--surface,#fff);color:var(--text,#111);' +
    `left:${x}px;top:${y}px;border:1px solid #8884;border-radius:6px;` +
    'box-shadow:0 4px 16px #0003;font:13px system-ui,sans-serif;overflow:hidden;min-width:140px;'

  const items: [string, () => void][] = 'emCommentEdit' in ctx
    ? [
        ['Edit Comment', () => {
          const parsed = ctx.rawSource.match(/^:(?:comment|ai)\[([\s\S]*)\]/)
          const note = promptNote(parsed?.[1] ?? '')
          if (note !== null) void postComment({ mode: 'edit', ...ctx, note })
        }],
      ]
    : [
        ['Add Comment', () => {
          const note = promptNote()
          if (note !== null) void postComment({ mode: 'comment', ...ctx, note })
        }],
        ['Add AI Comment', () => {
          const note = promptNote()
          if (note !== null) void postComment({ mode: 'ai', ...ctx, note })
        }],
      ]

  for (const [label, onClick] of items) {
    const item = document.createElement('div')
    item.textContent = label
    item.style.cssText = 'padding:6px 14px;cursor:pointer;white-space:nowrap;'
    item.addEventListener('mouseenter', () => { item.style.background = '#8882' })
    item.addEventListener('mouseleave', () => { item.style.background = '' })
    item.addEventListener('click', () => { closeMenu(); onClick() })
    menu.appendChild(item)
  }
  document.body.appendChild(menu)
}

document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement
  // mermaidPanZoom.ts already owns right-click on this element for its own pan/reset menu
  // (`e.preventDefault()` unconditionally) — don't fight it, and a rendered diagram isn't
  // commentable text anyway.
  if (target.closest('.em-mermaid__viewport')) return
  if (!lastCommentContext) return
  e.preventDefault()
  showMenu(e.clientX, e.clientY, lastCommentContext)
})

document.addEventListener('click', closeMenu)
