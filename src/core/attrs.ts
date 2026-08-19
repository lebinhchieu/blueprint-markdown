/**
 * attrs.ts — Parse the {…} attribute block common to all three directive forms.
 *
 * Grammar (informal):
 *   attrs   = token*
 *   token   = '#' word          → id
 *           | '.' word          → class
 *           | word '=' quoted   → named key/value
 *           | word '=' word     → named key/value
 *           | '"' … '"'         → (ignored at top level; only valid after '=')
 *           | bare word         → primary arg if first bare value, else boolean flag
 *
 * Examples:
 *   {title="A b" icon=home .myClass #myId open}
 *   {red}          → primary="red"
 *   {70}           → primary="70"
 *   {value=70 max=100 color=primary label="Upload"}
 */

import type { Attrs } from './types'

/**
 * Parse an attribute string (the content between the outermost `{` `}`).
 * Pass the raw source text — braces will be stripped automatically.
 * Returns an Attrs object. Never throws; malformed tokens are ignored.
 */
export function parseAttrs(raw: string): Attrs {
  const result: Attrs = {
    named: {},
    classes: [],
    id: undefined,
    flags: new Set<string>(),
    primary: undefined,
  }

  // Strip surrounding braces if present
  const src = raw.trim().replace(/^\{/, '').replace(/\}$/, '').trim()
  if (!src) return result

  let i = 0

  function skipWS(): void {
    while (i < src.length && /\s/.test(src[i])) i++
  }

  function readWord(): string {
    let out = ''
    while (i < src.length && !/[\s={}]/.test(src[i])) {
      out += src[i++]
    }
    return out
  }

  function readQuoted(): string {
    // i is on the opening '"'
    i++ // skip opening quote
    let out = ''
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\\' && i + 1 < src.length) {
        i++ // skip backslash
        out += src[i++]
      } else {
        out += src[i++]
      }
    }
    if (i < src.length) i++ // skip closing '"'
    return out
  }

  while (i < src.length) {
    skipWS()
    if (i >= src.length) break

    const ch = src[i]

    if (ch === '#') {
      // id
      i++
      result.id = readWord() || undefined
    } else if (ch === '.') {
      // class
      i++
      const cls = readWord()
      if (cls) result.classes.push(cls)
    } else if (ch === '"') {
      // Bare quoted string at top level — treat as primary arg if not yet set
      const val = readQuoted()
      if (result.primary === undefined) {
        result.primary = val
      }
    } else {
      // word — could be key=value, boolean flag, or primary arg
      const word = readWord()
      if (!word) { i++; continue }

      skipWS()
      if (i < src.length && src[i] === '=') {
        // key=value
        i++ // skip '='
        skipWS()
        let val: string
        if (i < src.length && src[i] === '"') {
          val = readQuoted()
        } else {
          val = readWord()
        }
        result.named[word] = val
      } else {
        // boolean flag or primary arg
        if (result.primary === undefined) {
          // If it looks like a color token, hex, or number → primary arg
          // Otherwise if it's a simple word and comes first → primary arg
          result.primary = word
        } else {
          result.flags.add(word)
        }
      }
    }
  }

  return result
}

/**
 * Resolve a `toc=h1|h2|h3` attribute to that tag name, or `undefined` if
 * absent or any other value — directives with a `title` attr use this to
 * render their title as a real heading (feeding the TOC rail and the actual
 * document outline) instead of their default span/div/summary wrapper.
 */
export function tocHeadingTag(attrs: Attrs): string | undefined {
  const v = attrs.named['toc']
  return v === 'h1' || v === 'h2' || v === 'h3' ? v : undefined
}

/**
 * Extract the attribute string from a directive line.
 * Returns the content of the first `{…}` block, or an empty string.
 *
 * @example extractAttrStr(':::card{title="A" icon=home}') → 'title="A" icon=home'
 */
export function extractAttrStr(line: string): string {
  const m = line.match(/\{([^}]*)\}/)
  return m ? m[1] : ''
}
