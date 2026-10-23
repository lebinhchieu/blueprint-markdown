/**
 * svgSanitize.ts — hand-rolled allowlist SVG sanitizer + CSS scoper.
 *
 * Pure: no vscode / fs / DOM. Tokenizes the source and RE-SERIALIZES only
 * allowlisted elements and attributes with escaped values; it never strips
 * markup out of the source text. Design: scopes/svgdraw/tasks/tech-design.md §2-4.
 *
 * Security stance: anything not explicitly allowed is dropped (element and its
 * whole subtree). Anything structurally unclear is an error, never a partial drawing.
 */

export const SVG_MAX_BYTES = 256 * 1024
const MAX_OUT = 2 * SVG_MAX_BYTES // sanitized output cap (CSS scoping can expand selectors)

export type SvgError =
  | { kind: 'empty' }
  | { kind: 'not-svg'; tag?: string }
  | { kind: 'malformed' }
  | { kind: 'too-large'; kb: number }
  | { kind: 'too-complex' }
  | { kind: 'nothing-to-draw' }

export type SvgResult =
  | { ok: true; html: string; scope: string }
  | { ok: false; error: SvgError }

const MAX_ELEMENTS = 20000
const MAX_DEPTH = 64
const MAX_ATTRS = 64
const MAX_ATTR_VALUE = 64 * 1024

// ───────────────────────── tables ─────────────────────────

const canon = (list: string): Map<string, string> => {
  const m = new Map<string, string>()
  for (const n of list.split(/\s+/)) if (n) m.set(n.toLowerCase(), n)
  return m
}

const TAGS = canon(
  'svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc ' +
    'linearGradient radialGradient stop pattern clipPath mask marker filter feGaussianBlur feDropShadow ' +
    'feOffset feFlood feMerge feMergeNode feComposite',
)

const DRAWABLE = new Set([
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'use',
])

const ATTRS = canon(
  // geometry / structure
  'x y width height cx cy r rx ry x1 y1 x2 y2 points d pathLength dx dy rotate textLength lengthAdjust ' +
    'refX refY markerWidth markerHeight markerUnits orient viewBox preserveAspectRatio transform ' +
    'fx fy fr gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform ' +
    'clipPathUnits maskUnits maskContentUnits primitiveUnits filterUnits offset startOffset method spacing side ' +
    // paint
    'fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit ' +
    'stroke-dasharray stroke-dashoffset stroke-opacity opacity color stop-color stop-opacity flood-color ' +
    'flood-opacity clip-path clip-rule mask filter marker-start marker-mid marker-end paint-order visibility ' +
    'display vector-effect shape-rendering text-rendering color-interpolation color-interpolation-filters ' +
    // text
    'font-family font-size font-weight font-style font-variant font-stretch text-anchor dominant-baseline ' +
    'alignment-baseline baseline-shift letter-spacing word-spacing text-decoration writing-mode direction ' +
    'unicode-bidi ' +
    // filters
    'stdDeviation in in2 result mode operator k1 k2 k3 k4 ' +
    // a11y / misc
    'role aria-label aria-labelledby aria-hidden xml:space ' +
    // handled specially
    'id class style href xlink:href',
)

const HREF_TAGS = new Set(['use', 'textPath', 'linearGradient', 'radialGradient', 'pattern'])
const VAR_PRESENTATION = new Set(['fill', 'stroke', 'stop-color', 'flood-color'])
const NO_VALUE_CHECK = new Set(['role', 'aria-label', 'aria-labelledby', 'aria-hidden', 'xml:space'])

// CSS declaration property allowlist (exact names + prefixes)
const CSS_PROPS = new Set(
  ('fill fill-opacity fill-rule stroke opacity color text-anchor dominant-baseline letter-spacing ' +
    'text-decoration stop-color stop-opacity paint-order visibility display transform transform-origin ' +
    'transform-box vector-effect clip-path mask filter flood-color flood-opacity').split(' '),
)
const CSS_PREFIXES = ['stroke-', 'font-', 'marker-']
const PSEUDOS = new Set(['hover', 'first-child', 'last-child', 'first-of-type', 'last-of-type'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
  middot: '·', bull: '•', hellip: '…', mdash: '—', ndash: '–', larr: '←',
  rarr: '→', uarr: '↑', darr: '↓', times: '×', deg: '°', trade: '™',
  laquo: '«', raquo: '»', euro: '€', plusmn: '±', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', check: '✓',
}

// ───────────────────────── helpers ─────────────────────────

class Fail {
  constructor(public error: SvgError) {}
}

const stripCtl = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,15});/g, (m, body: string) => {
    if (body[0] === '#') {
      const n = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!(n > 0 && n <= 0x10ffff) || (n >= 0xd800 && n <= 0xdfff)) return m
      return String.fromCodePoint(n)
    }
    const v = Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : undefined
    return v === undefined ? m : v
  })
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')

/** cyrb53 string hash. */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const ID_RE = /^[A-Za-z][\w.-]*$/
const CLASS_RE = /^[A-Za-z][\w-]*$/

const scopeClass = (tok: string, scope: string) => (tok.startsWith('em-svg-') ? tok : `${scope}-${tok}`)

// ───────────────────────── CSS ─────────────────────────

const BAD_VALUE = /\\|\/\*|@|<|>|expression|javascript|-moz-binding|behavior|\b(?:image-set|image|src|element|cross-fade|paint|attr|env)\s*\(/i
const URL_ID = /url\(\s*(['"]?)#([A-Za-z][\w.-]*)\1\s*\)/gi

/** Rewrite url(#id) → url(#scope-id). null = some other url( present → reject. */
function rewriteUrls(v: string, scope: string): string | null {
  if (!/url/i.test(v)) return v
  const rest = v.replace(URL_ID, '')
  if (/url\s*\(/i.test(rest)) return null
  return v.replace(URL_ID, (_m, _q, id: string) => `url(#${scope}-${id})`)
}

/** Balanced-paren walk: every `var(` must be var(--name) or var(--name, safe-fallback).
 *  Linear: one stack pass; var( nesting capped so each char is inspected by ≤ MAX_VAR_NEST inner checks. */
const MAX_VAR_NEST = 4
function varsOk(v: string): boolean {
  const lv = v.toLowerCase()
  const stack: number[] = [] // for each open paren: start index of a var( inner, or -1
  let varDepth = 0
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (c === '(') {
      const isVar = i >= 3 && lv.startsWith('var', i - 3)
      if (isVar) {
        if (++varDepth > MAX_VAR_NEST) return false
        stack.push(i + 1)
      } else stack.push(-1)
    } else if (c === ')') {
      const st = stack.pop()
      if (st === undefined) return false
      if (st >= 0) {
        varDepth--
        const m = /^\s*--[\w-]+\s*(?:,([#\w\s.,%()-]*))?$/.exec(v.slice(st, i))
        if (!m) return false
        if (m[1] && /url\s*\(/i.test(m[1])) return false
      }
    }
  }
  return stack.length === 0
}

/** Strings: reject any quoted string holding { } ; or a newline, or unbalanced quotes. */
function stringsOk(v: string): boolean {
  let q = ''
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (q) {
      if (c === q) q = ''
      else if (c === '{' || c === '}' || c === ';' || c === '\n' || c === '\r') return false
    } else if (c === '"' || c === "'") q = c
  }
  return q === ''
}

function cleanValue(raw: string, scope: string): string | null {
  let v = raw.replace(/!\s*important/gi, '').trim()
  if (!v || BAD_VALUE.test(v) || /[\u0000-\u001f]/.test(v)) return null
  if (!stringsOk(v)) return null
  const u = rewriteUrls(v, scope)
  if (u === null) return null
  v = u
  if (/var\s*\(/i.test(v) && !varsOk(v)) return null
  return v
}

function propAllowed(p: string): boolean {
  return CSS_PROPS.has(p) || CSS_PREFIXES.some((x) => p.startsWith(x))
}

/** Split on `;` outside quotes. */
function splitDecls(text: string): string[] {
  const out: string[] = []
  let q = ''
  let cur = ''
  for (const c of text) {
    if (q) {
      if (c === q) q = ''
      cur += c
    } else if (c === '"' || c === "'") {
      q = c
      cur += c
    } else if (c === ';') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** Filter declarations (style attr or rule body) → "a:b;c:d" or ''. */
function filterDecls(text: string, scope: string): string {
  const out: string[] = []
  for (const d of splitDecls(text)) {
    const at = d.indexOf(':')
    if (at < 0) continue
    const prop = d.slice(0, at).trim().toLowerCase()
    if (!propAllowed(prop)) continue
    const val = cleanValue(d.slice(at + 1), scope)
    if (val !== null) out.push(`${prop}:${val}`)
  }
  return out.join(';')
}

/** Remove /* *​/ comments outside strings. Throws-free; returns null on newline-in-string. */
function stripCssComments(s: string): string | null {
  let out = ''
  let q = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '\\') {
        out += c + (s[i + 1] ?? '')
        i++
        continue
      }
      if (c === '\n' || c === '\r') return null
      if (c === q) q = ''
      out += c
    } else if (c === '"' || c === "'") {
      q = c
      out += c
    } else if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      if (end < 0) return out
      i = end + 1
      out += ' '
    } else out += c
  }
  return q ? null : out
}

/** Index of the `}` closing the block opened at s[open]=='{'; -1 if unbalanced. Sets nested if a 2nd `{` seen. */
function blockEnd(s: string, open: number): { end: number; nested: boolean } {
  let depth = 0
  let q = ''
  let nested = false
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '\\') i++
      else if (c === q) q = ''
    } else if (c === '"' || c === "'") q = c
    else if (c === '{') {
      depth++
      if (depth > 1) nested = true
    } else if (c === '}' && --depth === 0) return { end: i, nested }
  }
  return { end: -1, nested }
}

const COMPOUND = /^(?:[A-Za-z_][\w-]*|\*)?(?:\.[A-Za-z_][\w-]*|#[A-Za-z][\w-]*|:[a-z-]+)*$/

function scopeSelector(sel: string, scope: string): string | null {
  const s = sel.trim()
  if (!s) return null
  const parts = s.split(/(\s*>\s*|\s+)/)
  let out = ''
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (i % 2 === 1) {
      out += p.includes('>') ? ' > ' : ' '
      continue
    }
    if (!p || !COMPOUND.test(p)) return null
    let comp = ''
    const re = /(\.[A-Za-z_][\w-]*|#[A-Za-z][\w-]*|:[a-z-]+)|([A-Za-z_][\w-]*|\*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(p))) {
      const t = m[1] ?? m[2]
      if (t[0] === '.') comp += '.' + scopeClass(t.slice(1), scope)
      else if (t[0] === '#') comp += `#${scope}-${t.slice(1)}`
      else if (t[0] === ':') {
        if (!PSEUDOS.has(t.slice(1))) return null
        comp += t
      } else comp += t
    }
    out += comp
  }
  return `.${scope} ${out}`
}

/** Scope a <style> body. Returns the rewritten CSS ('' if nothing survives). */
function scopeCss(css: string, scope: string): string {
  const stripped = stripCssComments(css.replace(/<!\[CDATA\[|\]\]>/g, ''))
  if (stripped === null) return ''
  const s = stripped
  const rules: string[] = []
  let i = 0
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++
    if (i >= s.length) break
    if (s[i] === '@') {
      // at-rule: drop to `;` or a balanced block
      let j = i
      while (j < s.length && s[j] !== ';' && s[j] !== '{') j++
      if (s[j] === '{') {
        const b = blockEnd(s, j)
        if (b.end < 0) break
        i = b.end + 1
      } else i = j + 1
      continue
    }
    const open = s.indexOf('{', i)
    if (open < 0) break
    const b = blockEnd(s, open)
    if (b.end < 0) break
    const selText = s.slice(i, open)
    const body = s.slice(open + 1, b.end)
    i = b.end + 1
    if (b.nested) continue
    const sels = selText
      .split(',')
      .map((x) => scopeSelector(x, scope))
      .filter((x): x is string => x !== null)
    const decls = filterDecls(body, scope)
    if (sels.length && decls) rules.push(`${sels.join(',')}{${decls}}`)
  }
  return rules.join('\n')
}

// ───────────────────────── attributes ─────────────────────────

interface RawAttr {
  name: string // lower-case
  value: string // entity-decoded
}

function buildAttrs(tag: string, raw: RawAttr[], scope: string, isRoot: boolean): string {
  const seen = new Set<string>()
  const out: string[] = []
  const moved: string[] = []
  let style = ''
  let hasViewBox = false
  let w = ''
  let h = ''
  for (const { name, value: rv } of raw) {
    const cn = ATTRS.get(name)
    if (!cn || seen.has(cn === 'xlink:href' ? 'href' : cn)) continue
    seen.add(cn === 'xlink:href' ? 'href' : cn)
    const value = stripCtl(rv)
    if (cn === 'id') {
      if (ID_RE.test(value)) out.push(`id="${escAttr(`${scope}-${value}`)}"`)
      continue
    }
    if (cn === 'class') {
      const toks = value
        .split(/\s+/)
        .filter((t) => CLASS_RE.test(t))
        .map((t) => scopeClass(t, scope))
      if (toks.length) out.push(`class="${escAttr(toks.join(' '))}"`)
      continue
    }
    if (cn === 'aria-labelledby') {
      const toks = value.split(/\s+/).filter((t) => ID_RE.test(t)).map((t) => `${scope}-${t}`)
      if (toks.length) out.push(`aria-labelledby="${escAttr(toks.join(' '))}"`)
      continue
    }
    if (cn === 'style') {
      style = filterDecls(value, scope)
      continue
    }
    if (cn === 'href' || cn === 'xlink:href') {
      if (!HREF_TAGS.has(tag)) continue
      const v = value.replace(/[\u0000- \u007f-\u009f]/g, '')
      if (/^#[A-Za-z][\w.-]*$/.test(v)) out.push(`href="${escAttr(`#${scope}-${v.slice(1)}`)}"`)
      continue
    }
    let v: string | null = value
    if (!NO_VALUE_CHECK.has(cn)) {
      v = cleanValue(value, scope)
      if (v === null) continue
      if (VAR_PRESENTATION.has(cn) && /var\s*\(/i.test(v)) {
        moved.push(`${cn}:${v}`)
        continue
      }
    }
    if (cn === 'viewBox') hasViewBox = true
    if (isRoot && cn === 'width') w = v
    if (isRoot && cn === 'height') h = v
    out.push(`${cn}="${escAttr(v)}"`)
  }
  if (isRoot && !hasViewBox) {
    const num = /^(\d+(?:\.\d+)?)(?:px)?$/
    const mw = num.exec(w)
    const mh = num.exec(h)
    if (mw && mh) out.push(`viewBox="0 0 ${mw[1]} ${mh[1]}"`)
  }
  const st = [...moved, ...(style ? [style] : [])].join(';')
  if (st) out.push(`style="${escAttr(st)}"`)
  return out.length ? ' ' + out.join(' ') : ''
}

// ───────────────────────── parser / serializer ─────────────────────────

type Mode = 'keep' | 'unwrap' | 'drop' | 'textonly'
interface Frame {
  key: string // lower-case raw name (for closer matching)
  tag: string // canonical emitted tag ('' if not emitted)
  mode: Mode
  id?: string // emitted (scoped) id, for <use> amplification check
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9:_.-]*$/

function run(src: string): SvgResult {
  const n = src.length
  const scope = 's' + cyrb53(src.trim()).toString(36)
  const out: string[] = []
  const stack: Frame[] = []
  let rootSeen = false
  let rootClosed = false
  let elements = 0
  let drawable = 0
  let outLen = 0
  const useTargets = new Set<string>()
  const containsUse = new Set<string>()
  let i = 0

  const top = () => stack[stack.length - 1]
  const dropping = () => stack.length > 0 && top().mode === 'drop'

  let lowerSrc: string | undefined
  const rawSkip = (key: string, from: number): { content: string; next: number } => {
    const lower = (lowerSrc ??= src.toLowerCase())
    const at = lower.indexOf('</' + key, from)
    if (at < 0) throw new Fail({ kind: 'malformed' })
    let j = at + 2 + key.length
    while (j < n && /\s/.test(src[j])) j++
    if (src[j] !== '>') throw new Fail({ kind: 'malformed' })
    return { content: src.slice(from, at), next: j + 1 }
  }

  while (i < n) {
    if (src[i] !== '<') {
      const lt = src.indexOf('<', i)
      const end = lt < 0 ? n : lt
      const text = src.slice(i, end)
      i = end
      if (stack.length === 0) {
        if (text.trim() !== '') throw new Fail({ kind: 'not-svg' })
      } else if (!dropping()) out.push(escText(stripCtl(decodeEntities(text))))
      continue
    }
    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4)
      if (e < 0) throw new Fail({ kind: 'malformed' })
      i = e + 3
      continue
    }
    if (src.startsWith('<![CDATA[', i)) {
      const e = src.indexOf(']]>', i + 9)
      if (e < 0) throw new Fail({ kind: 'malformed' })
      const text = src.slice(i + 9, e)
      i = e + 3
      if (stack.length === 0) {
        if (text.trim() !== '') throw new Fail({ kind: 'not-svg' })
      } else if (!dropping()) out.push(escText(stripCtl(text)))
      continue
    }
    if (src.startsWith('<?', i)) {
      const e = src.indexOf('?>', i + 2)
      if (e < 0) throw new Fail({ kind: 'malformed' })
      i = e + 2
      continue
    }
    if (src.startsWith('<!', i)) {
      // DOCTYPE (with optional [internal subset]) and anything else <!…>: dropped, never expanded
      if (++elements > MAX_ELEMENTS) throw new Fail({ kind: 'too-complex' })
      let j = i + 2
      const gt = src.indexOf('>', j)
      if (gt < 0) throw new Fail({ kind: 'malformed' })
      let br = -1
      for (let k = j; k < gt; k++) if (src[k] === '[') { br = k; break }
      if (br >= 0) {
        const close = src.indexOf(']', br + 1)
        if (close < 0) throw new Fail({ kind: 'malformed' })
        j = close + 1
        const g2 = src.indexOf('>', j)
        if (g2 < 0) throw new Fail({ kind: 'malformed' })
        i = g2 + 1
      } else {
        if (gt < 0) throw new Fail({ kind: 'malformed' })
        i = gt + 1
      }
      continue
    }
    if (src[i + 1] === '/') {
      const gt = src.indexOf('>', i + 2)
      if (gt < 0) throw new Fail({ kind: 'malformed' })
      const name = src.slice(i + 2, gt).trim()
      i = gt + 1
      const f = stack.pop()
      if (!f || !NAME_RE.test(name) || name.toLowerCase() !== f.key) throw new Fail({ kind: 'malformed' })
      if (f.tag) out.push(`</${f.tag}>`)
      if (stack.length === 0) rootClosed = true
      continue
    }
    // open tag
    let j = i + 1
    while (j < n && /[A-Za-z0-9:_.-]/.test(src[j])) j++
    const name = src.slice(i + 1, j)
    if (!NAME_RE.test(name)) throw new Fail({ kind: 'malformed' })
    const key = name.toLowerCase()
    const attrs: RawAttr[] = []
    let selfClose = false
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++
      if (j >= n) throw new Fail({ kind: 'malformed' })
      const c = src[j]
      if (c === '>') {
        j++
        break
      }
      if (c === '/') {
        if (src[j + 1] !== '>') throw new Fail({ kind: 'malformed' })
        selfClose = true
        j += 2
        break
      }
      const s0 = j
      while (j < n && !/[\s=/>"'<]/.test(src[j])) j++
      if (j === s0) throw new Fail({ kind: 'malformed' })
      const an = src.slice(s0, j).toLowerCase()
      while (j < n && /\s/.test(src[j])) j++
      if (src[j] !== '=') throw new Fail({ kind: 'malformed' })
      j++
      while (j < n && /\s/.test(src[j])) j++
      const q = src[j]
      if (q !== '"' && q !== "'") throw new Fail({ kind: 'malformed' })
      const e = src.indexOf(q, j + 1)
      if (e < 0) throw new Fail({ kind: 'malformed' })
      const rawVal = src.slice(j + 1, e)
      if (rawVal.length > MAX_ATTR_VALUE) throw new Fail({ kind: 'too-complex' })
      attrs.push({ name: an, value: decodeEntities(rawVal) })
      if (attrs.length > MAX_ATTRS) throw new Fail({ kind: 'too-complex' })
      j = e + 1
      if (j < n && !/[\s/>]/.test(src[j])) throw new Fail({ kind: 'malformed' })
    }
    i = j

    if (++elements > MAX_ELEMENTS) throw new Fail({ kind: 'too-complex' })

    // root checks
    if (stack.length === 0) {
      if (rootSeen || rootClosed) throw new Fail({ kind: 'not-svg', tag: name.slice(0, 20) })
      if (key !== 'svg') throw new Fail({ kind: 'not-svg', tag: name.slice(0, 20) })
      rootSeen = true
    }

    // raw-text elements: content never parsed as markup, in any mode
    if (key === 'script' || key === 'style') {
      if (!selfClose) {
        const { content, next } = rawSkip(key, i)
        i = next
        if (key === 'style' && stack.length > 0 && (top().mode === 'keep' || top().mode === 'unwrap')) {
          const css = scopeCss(decodeEntities(content), scope)
          if (css) {
            outLen += css.length
            if (outLen > MAX_OUT) throw new Fail({ kind: 'too-complex' })
            out.push(`<style>${escText(css)}</style>`)
          }
        }
      }
      continue
    }

    const parent = stack.length ? top() : undefined
    let frame: Frame
    const canonTag = TAGS.get(key)
    if (parent && parent.mode === 'drop') frame = { key, tag: '', mode: 'drop' }
    else if (parent && parent.mode === 'textonly') frame = { key, tag: '', mode: 'drop' }
    else if (key === 'a') frame = { key, tag: '', mode: 'unwrap' }
    else if (canonTag) {
      const textOnly = canonTag === 'title' || canonTag === 'desc'
      frame = { key, tag: canonTag, mode: textOnly ? 'textonly' : 'keep' }
      const built = buildAttrs(canonTag, attrs, scope, stack.length === 0)
      out.push(`<${canonTag}${built}>`)
      const idm = / id="([^"]*)"/.exec(built)
      if (idm) frame.id = idm[1]
      if (canonTag === 'use') {
        // <use> must not sit in / be an element that is itself a <use> target (reference amplification)
        for (const f of stack) if (f.id) containsUse.add(f.id)
        if (frame.id) containsUse.add(frame.id)
        const hm = / href="#([^"]*)"/.exec(built)
        if (hm) useTargets.add(hm[1])
      }
      if (DRAWABLE.has(canonTag)) drawable++
    } else frame = { key, tag: '', mode: 'drop' }

    if (selfClose) {
      if (frame.tag) out.push(`</${frame.tag}>`)
      if (stack.length === 0) rootClosed = true
    } else {
      stack.push(frame)
      if (stack.length > MAX_DEPTH) throw new Fail({ kind: 'too-complex' })
    }
  }

  if (stack.length > 0) throw new Fail({ kind: 'malformed' })
  if (!rootSeen) throw new Fail({ kind: 'not-svg' })
  for (const t of useTargets) if (containsUse.has(t)) throw new Fail({ kind: 'too-complex' })
  if (drawable === 0) throw new Fail({ kind: 'nothing-to-draw' })
  const html = out.join('')
  if (html.length > MAX_OUT) throw new Fail({ kind: 'too-complex' })
  return { ok: true, html, scope }
}

export function sanitizeSvg(src: string): SvgResult {
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1)
  if (src.trim() === '') return { ok: false, error: { kind: 'empty' } }
  const bytes = src.length * 3 > SVG_MAX_BYTES ? new TextEncoder().encode(src).length : src.length
  if (bytes > SVG_MAX_BYTES) return { ok: false, error: { kind: 'too-large', kb: Math.ceil(bytes / 1024) } }
  try {
    return run(src)
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.error }
    return { ok: false, error: { kind: 'malformed' } }
  }
}
