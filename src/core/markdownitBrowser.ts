/**
 * markdownitBrowser.ts — browser-safe markdown-it factory.
 *
 * Same setup as createMarkdownIt() in markdownit.ts, minus
 * installInlineCodeRenderer (needs Node's fs/path and the vscode API, so it
 * can only run in the extension host). Use this wherever markdown must be
 * rendered client-side — e.g. the mindmap detail drawer, rendered on demand
 * when a node is clicked (see src/core/mindmap/mountMindmap.ts).
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
