/**
 * markdownitBrowser.ts — browser-safe markdown-it factory.
 *
 * Same setup as createMarkdownIt() in markdownit.ts, minus
 * installInlineCodeRenderer (needs Node's fs/path and the vscode API, so it
 * can only run in the extension host). Use this wherever markdown must be
 * rendered client-side.
 */

import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
import markdownItTaskLists from 'markdown-it-task-lists'
import { installFenceRenderer } from './fence'

export function createBrowserMarkdownIt(options?: Record<string, unknown>): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    ...options,
  })

  md.use(markdownItMark)
  md.use(markdownItTaskLists, { label: true })
  installFenceRenderer(md)

  return md
}

/**
 * Even lighter markdown-it: same plugins, but skips installFenceRenderer —
 * which pulls in all of highlight.js (~1 MB) for syntax coloring. Code
 * fences fall back to markdown-it's own default (plain <pre><code>, no
 * highlighting). Use this for small, on-demand client-side snippets where
 * that cost isn't worth paying. Bundled into both dist/preview.js and
 * dist/export-client.js, so keeping it hljs-free matters for both.
 */
export function createMinimalMarkdownIt(options?: Record<string, unknown>): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    ...options,
  })

  md.use(markdownItMark)
  md.use(markdownItTaskLists, { label: true })

  return md
}
