/**
 * preview.ts — standalone CLI preview server. Renders through the same engine as the VS Code
 * preview and "Export to HTML" (buildHtml.ts / installBlueprintMarkdown.ts) so all three stay
 * in sync, but serves live over HTTP instead of producing a one-shot file — for editors with
 * no webview hook of their own (Zed today; anything else tomorrow).
 *
 * One server, many open documents: `blueprint-preview a.md` then `blueprint-preview b.md` is
 * one process and two browser tabs, not two servers — see main()'s EADDRINUSE handling.
 *
 * Usage: blueprint-preview <file.md> [--theme=light] [--toc=h3] [--port=7337] [--no-open]
 *
 * (The shebang is added by esbuild's `banner` option in esbuild.mjs, not here — a literal
 * one in this source file would double up in the bundle.)
 */

import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { spawn, execFileSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { buildHtml, MissingArtifactError } from '../export/buildHtml'
import { findInsertOffset, findReplaceRange } from '../core/commentEdit'

const DEFAULT_PORT = 7337
const DIST_DIR = __dirname // dist/ once bundled — this file lands at dist/blueprint-preview.js

/** ponytail: Windows path in → WSL path out, no-op everywhere else. Zed for Windows (running
 *  a task via `wsl.exe`) hands us `C:\proj\a.md`. `wslpath` is authoritative — it honours a
 *  custom automount root — so shell out to it rather than string-munging `/mnt/<drive>`. */
function toLocalPath(p: string): string {
  if (!/^[A-Za-z]:[\\/]/.test(p)) return p
  try {
    return execFileSync('wslpath', ['-u', p], { encoding: 'utf8' }).trim()
  } catch {
    return p // not WSL, or wslpath missing — let the existsSync check below report it
  }
}

// ─── Per-document state ──────────────────────────────────────────────────────

interface DocState {
  clients: Set<http.ServerResponse>
  watcher: (() => void) | null
}

const docs = new Map<string, DocState>()

function ensureWatcher(filePath: string, doc: DocState): void {
  if (doc.watcher) return
  let debounce: NodeJS.Timeout | null = null
  const pushReload = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      for (const res of doc.clients) res.write('data: reload\n\n')
    }, 50)
  }
  try {
    // ponytail: DrvFS (/mnt/c, /mnt/d, …) has no inotify — fs.watch registers fine there but
    // never fires. Fall back to polling for paths under a WSL drive mount; 300ms is well under
    // save-to-glance latency and it's one stat per open doc.
    if (/^\/mnt\/[a-z]\//.test(filePath)) {
      fs.watchFile(filePath, { interval: 300 }, pushReload)
      doc.watcher = () => fs.unwatchFile(filePath, pushReload)
    } else {
      const w = fs.watch(filePath, pushReload)
      doc.watcher = () => w.close()
    }
  } catch {
    // File missing/unwatchable — the page will just not live-reload; not fatal.
  }
}

function registerDoc(filePath: string): DocState {
  let doc = docs.get(filePath)
  if (!doc) {
    doc = { clients: new Set(), watcher: null }
    docs.set(filePath, doc)
  }
  ensureWatcher(filePath, doc)
  return doc
}

// ─── HTML page for a document ────────────────────────────────────────────────

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function renderPage(filePath: string, theme: string, toc: string, clientJs: string): string {
  const source = fs.readFileSync(filePath, 'utf8')

  // Reuses the exact DOM contract src/core/commentInsert.ts already reads (see its header
  // comment) — no code change needed there for the CLI to feed it a source URI.
  const settingsAttr = escapeAttr(JSON.stringify({ source: pathToFileURL(filePath).href }))
  const extraHead =
    `<div id="vscode-markdown-preview-data" data-settings="${settingsAttr}" hidden></div>\n` +
    `<script>window.__blueprintFile=${JSON.stringify(filePath)}</script>\n` +
    `<script>${clientJs}</script>\n`

  return buildHtml({
    source,
    theme,
    toc,
    distDir: DIST_DIR,
    title: path.basename(filePath),
    extraHead,
    interactive: true, // stamp data-line on plain prose too — needed for the comment feature
  })
}

// ─── Comment endpoint ─────────────────────────────────────────────────────────

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

async function handleComment(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req)
  const uri = String(body.uri ?? '')
  const filePath = uri.startsWith('file:') ? fileURLToPath(uri) : uri
  const line = Number(body.line ?? 0)
  const note = String(body.note ?? '')

  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`cannot read ${filePath}`)
    return
  }

  let newText: string
  if (body.mode === 'edit') {
    const target = findReplaceRange(text, line, {
      rawSource: String(body.rawSource ?? ''),
      nth: Number(body.nth ?? 0),
      blockLength: Number(body.blockLength ?? 0),
    })
    if (!target) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('could not locate that comment — it may have changed.')
      return
    }
    newText = text.slice(0, target.start) + `:${target.directiveName}[${note}]${target.attrsPart}` + text.slice(target.end)
  } else {
    const directiveName = body.mode === 'ai' ? 'ai' : 'comment'
    const offset = findInsertOffset(text, line, {
      selectedText: String(body.selectedText ?? ''),
      inlineCode: Boolean(body.inlineCode),
      nth: Number(body.nth ?? 0),
      blockLength: Number(body.blockLength ?? 0),
    })
    if (offset === null) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('could not locate the selected text — comment not inserted.')
      return
    }
    newText = text.slice(0, offset) + ` :${directiveName}[${note}]` + text.slice(offset)
  }

  fs.writeFileSync(filePath, newText)
  // No explicit reload push here — the file watcher (already running for live reload)
  // sees this write and pushes the same event an editor save would.
  res.writeHead(204).end()
}

// ─── Server ───────────────────────────────────────────────────────────────────

function startServer(port: number, theme: string, toc: string): http.Server {
  const clientJs = fs.readFileSync(path.join(DIST_DIR, 'cli-client.js'), 'utf8')

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'GET' && url.pathname === '/') {
      const f = url.searchParams.get('f')
      if (!f) { res.writeHead(400).end('missing ?f='); return }
      registerDoc(f)
      let html: string
      try {
        html = renderPage(f, theme, toc, clientJs)
      } catch (e) {
        const msg = e instanceof MissingArtifactError ? e.message : String(e)
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(msg)
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html)
      return
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      const f = url.searchParams.get('f')
      if (!f) { res.writeHead(400).end(); return }
      const doc = registerDoc(f)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write('\n')
      doc.clients.add(res)
      req.on('close', () => {
        doc.clients.delete(res)
        // Close the last tab watching this file → release the watcher. A later GET / for the
        // same path re-arms it via registerDoc's ensureWatcher call.
        if (doc.clients.size === 0 && doc.watcher) {
          doc.watcher()
          doc.watcher = null
        }
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/open') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const f = toLocalPath(body.trim())
        registerDoc(f)
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`http://localhost:${port}/?f=${encodeURIComponent(f)}`)
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/comment') {
      handleComment(req, res).catch((e) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e))
      })
      return
    }

    res.writeHead(404).end('not found')
  })

  server.listen(port)
  return server
}

/** ponytail: best-effort browser opener — one shell-out per platform, falling back through
 *  candidates and finally to printing the URL if none of them exist. `cmd.exe` (WSL interop,
 *  enabled by default) is tried before `wslview` (needs the optional `wslu` package installed)
 *  since it's the one guaranteed to be present on a stock WSL install. */
function openUrl(url: string): void {
  const isWsl = (() => {
    try { return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8')) } catch { return false }
  })()
  const platform = process.platform
  const candidates: [string, string[]][] =
    isWsl ? [['cmd.exe', ['/c', 'start', '""', url]], ['wslview', [url]]]
    : platform === 'darwin' ? [['open', [url]]]
    : platform === 'win32' ? [['cmd', ['/c', 'start', '""', url]]]
    : [['xdg-open', [url]]]

  const tryNext = (i: number): void => {
    if (i >= candidates.length) { console.log(`Open manually: ${url}`); return }
    const [cmd, args] = candidates[i]
    try {
      const child = spawn(cmd, args, { stdio: 'ignore' })
      child.on('error', () => tryNext(i + 1))
      child.unref()
    } catch {
      tryNext(i + 1)
    }
  }
  tryNext(0)
}

function main(): void {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  const flag = (name: string, def: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def
  const theme = flag('theme', 'light')
  const toc = flag('toc', 'h3')
  const port = Number(flag('port', String(DEFAULT_PORT)))
  const noOpen = args.includes('--no-open')

  if (!file) {
    console.error('Usage: blueprint-preview <file.md> [--theme=light] [--toc=h3] [--port=7337] [--no-open]')
    process.exit(1)
  }
  const absFile = path.resolve(toLocalPath(file))
  if (!fs.existsSync(absFile)) {
    console.error(`File not found: ${absFile}`)
    process.exit(1)
  }

  const server = startServer(port, theme, toc)
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') throw err
    // Another instance already owns this port — hand it the file instead of starting a
    // second server. One process, N browser tabs (see header comment).
    const req = http.request({ host: 'localhost', port, path: '/open', method: 'POST' }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (!noOpen) openUrl(body.trim())
        process.exit(0)
      })
    })
    req.on('error', () => {
      console.error(`Port ${port} is in use by something other than blueprint-preview.`)
      process.exit(1)
    })
    req.end(absFile)
  })
  server.on('listening', () => {
    const url = `http://localhost:${port}/?f=${encodeURIComponent(absFile)}`
    console.log(url)
    if (!noOpen) openUrl(url)
  })
}

main()
