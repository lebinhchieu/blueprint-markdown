/**
 * narration.ts — Present-mode script: :::narration, :::say, and the inline :cue / :at markers.
 *
 * Targets are named with `{#id}` on a directive, `#id` in a fence info string, or an
 * inline `:cue{#id}` inside a heading, paragraph, list item or table row:
 *
 *   | **What you see** :cue{#see} | … |
 *
 *   :::narration{lang="vi" voice="Hải Đăng"}   ← both optional; see core/speech.ts for defaults
 *   :::say{on="answer see" note="Bug 2 is silent" lines="3-6"}
 *   Spoken narration for this segment. :at{#see} From here on, the #see row is the focused point.
 *   :::
 *   :::
 *
 * Everything renders hidden, so the document looks unchanged until core/present.ts
 * reads it back from the DOM.
 */

import type { DirectiveSpec } from '../types'
import { speechText } from '../speech'

export const narrationDirectives: Record<string, DirectiveSpec> = {
  narration: {
    forms: ['container'],
    render(node, ctx) {
      const attr = (key: string) => node.attrs.named[key] ? ` data-${key}="${ctx.esc(node.attrs.named[key])}"` : ''
      return `<div class="em-narration" hidden${attr('lang')}${attr('voice')}>${ctx.renderChildren(node)}</div>`
    },
  },

  say: {
    forms: ['container'],
    render(node, ctx) {
      const attr = (key: string, name: string) => {
        const v = node.attrs.named[key]
        return v ? ` ${name}="${ctx.esc(v)}"` : ''
      }
      const body = ctx.renderChildren(node)
      return (
        `<div class="em-say" hidden data-speech="${ctx.esc(speechText(body))}"${attr('on', 'data-on')}${attr('note', 'data-note')}${attr('lines', 'data-lines')}>` +
        `${body}</div>`
      )
    },
  },

  // :cue{#id} marks its enclosing block; {#id list} / {#id table} widen it to the list or table.
  cue: {
    forms: ['inline'],
    render(node, ctx) {
      if (!node.attrs.id) return ''
      const scope = node.attrs.primary ? ` data-cue-scope="${ctx.esc(node.attrs.primary)}"` : ''
      return `<span class="em-cue" hidden data-cue="${ctx.esc(node.attrs.id)}"${scope}></span>`
    },
  },

  // Inside a :::say — from this sentence on, focus the point #id (or `lines` of the lit code).
  // Renders empty, so the spoken text (and its audio file name) is unchanged.
  at: {
    forms: ['inline'],
    render(node, ctx) {
      const id = node.attrs.id ? ` data-at="${ctx.esc(node.attrs.id)}"` : ''
      const lines = node.attrs.named['lines'] ? ` data-lines="${ctx.esc(node.attrs.named['lines'])}"` : ''
      return id || lines ? `<span class="em-at" hidden${id}${lines}></span>` : ''
    },
  },
}
