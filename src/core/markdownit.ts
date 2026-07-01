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

import type MarkdownIt from 'markdown-it'
import { createBrowserMarkdownIt } from './markdownitBrowser'
import { installInlineCodeRenderer } from './inline-code'

/** Shared markdown-it instance used by the renderer. */
let _md: MarkdownIt | null = null

export function createMarkdownIt(options?: Record<string, unknown>): MarkdownIt {
  const md = createBrowserMarkdownIt(options)

  // Custom inline code renderer (detects file refs like `foo.ts:73`) — needs
  // Node's fs/path and the vscode API, so only safe in the extension host.
  installInlineCodeRenderer(md)

  return md
}

/** Get (or lazily create) the default shared md instance. */
export function getMd(): MarkdownIt {
  if (!_md) _md = createMarkdownIt()
  return _md
}
