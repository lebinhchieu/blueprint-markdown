/**
 * inline.ts — markdown-it inline rule for enhanced-markdown inline directives.
 *
 * Grammar: :name[text]{attrs}   (chip, icon, color, kbd, button, tooltip)
 *          :name{attrs}         (rating — no [text])
 *
 * The rule is registered before 'backticks' in the inline ruler chain.
 *
 * Guard: require ':name[' or ':name{' (name char + bracket/brace) so bare ':' in
 * prose (http://, 12:30) never misfires, and markdown-it-mark (==…==) coexists.
 *
 * Output: emitted as html_inline token (pre-rendered HTML) so markdown-it does not
 * double-escape the generated markup. Inner [text] is rendered via renderInline;
 * all attribute values are escaped with md.utils.escapeHtml.
 */

import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type { DirectiveSpec, DirectiveNode } from './types'
import { parseAttrs } from './attrs'
import { resolveColor } from './colors'

const NAME_RE = /^:([A-Za-z][\w-]*)/

/** Parse :name[text]{attrs} or :name{attrs} starting at pos in src */
function parseInlineDirective(
  src: string,
  pos: number,
): { name: string; text: string | undefined; attrsRaw: string; end: number } | null {
  if (src[pos] !== ':') return null
  const nm = src.slice(pos).match(NAME_RE)
  if (!nm) return null
  const name = nm[1]
  let i = pos + 1 + name.length

  let text: string | undefined
  // Optional [text]
  if (src[i] === '[') {
    const closeIdx = src.indexOf(']', i + 1)
    if (closeIdx === -1) return null
    text = src.slice(i + 1, closeIdx)
    i = closeIdx + 1
  }

  // Optional {attrs}
  let attrsRaw = ''
  if (src[i] === '{') {
    const closeIdx = src.indexOf('}', i + 1)
    if (closeIdx === -1) return null
    attrsRaw = src.slice(i, closeIdx + 1)
    i = closeIdx + 1
  }

  // Must have at least text or attrs
  if (text === undefined && attrsRaw === '') return null

  return { name, text, attrsRaw, end: i }
}

/**
 * Install the inline directive rule on a markdown-it instance.
 * @param registry The directive registry to dispatch inline renders.
 *                 Pass the same registry object used by the block renderer.
 */
export function installInlineRule(
  md: MarkdownIt,
  registry: Record<string, DirectiveSpec>,
): void {
  md.inline.ruler.before(
    'backticks',
    'enhanced_inline_directive',
    (state: StateInline, silent: boolean): boolean => {
      const src = state.src
      const pos = state.pos

      if (src[pos] !== ':') return false
      // Quick guard: ':name[' or ':name{'
      if (!/^:[A-Za-z][\w-]*[\[{]/.test(src.slice(pos))) return false

      const parsed = parseInlineDirective(src, pos)
      if (!parsed) return false

      if (silent) return true

      const spec = registry[parsed.name]
      const attrs = parseAttrs(parsed.attrsRaw)

      const node: DirectiveNode = {
        type: 'directive',
        form: 'inline',
        name: parsed.name,
        attrs,
        text: parsed.text,
        closed: true,
      }

      const ctx = {
        renderChildren: () => '',
        renderInline: (m: string) => md.renderInline(m),
        esc: (s: string) => md.utils.escapeHtml(s),
        resolveColor: (t?: string) => resolveColor(t) ?? '',
      }

      let html: string
      if (!spec || !spec.forms.includes('inline')) {
        // Fail-soft: emit visible labelled span
        const label = parsed.text
          ? md.utils.escapeHtml(parsed.text)
          : md.utils.escapeHtml(parsed.name)
        html = `<span class="directive-unknown-inline" data-directive="${md.utils.escapeHtml(parsed.name)}">${label}</span>`
      } else {
        html = spec.render(node, ctx)
      }

      const token = state.push('html_inline', '', 0)
      token.content = html
      state.pos = parsed.end

      return true
    },
  )
}
