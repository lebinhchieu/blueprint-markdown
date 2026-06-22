/**
 * markdownit.ts — Create and configure the markdown-it instance.
 *
 * Loaded plugins:
 *   - markdown-it-mark       → ==highlight==
 *   - markdown-it-task-lists → - [ ] / - [x]
 *
 * NOT loaded:
 *   - markdown-it-attrs (would double-parse our {} directive attrs)
 *
 * The fence rule is overridden by installFenceRenderer from fence.ts.
 * The inline directive rule is added by installInlineRule from inline.ts.
 */

import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
import markdownItTaskLists from 'markdown-it-task-lists'
import { installFenceRenderer } from './fence'
import { installInlineCodeRenderer } from './inline-code'

/** Shared markdown-it instance used by the renderer. */
let _md: MarkdownIt | null = null

export function createMarkdownIt(options?: Record<string, unknown>): MarkdownIt {
  const md = new MarkdownIt({
    html: false,       // no raw HTML passthrough (security)
    linkify: true,
    typographer: false,
    breaks: false,
    ...options,
  })

  // Plugins
  md.use(markdownItMark)
  md.use(markdownItTaskLists, { label: true })

  // Custom fence renderer
  installFenceRenderer(md)

  // Custom inline code renderer (detects file refs like `foo.ts:73`)
  installInlineCodeRenderer(md)

  return md
}

/** Get (or lazily create) the default shared md instance. */
export function getMd(): MarkdownIt {
  if (!_md) _md = createMarkdownIt()
  return _md
}
