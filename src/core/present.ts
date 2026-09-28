/**
 * present.ts — Present mode: a narrated walkthrough of a rendered document.
 *
 * Call startPresent(root) on a DOM that contains rendered :::narration output.
 * It reads the hidden .em-say segments and, for each one, rings the cued blocks
 * (the section) and follows the narration inside them sentence by sentence (the
 * point: a list item, row, step, card or diagram node), and speaks with a synced
 * caption in a floating dock that also shows the segment's note.
 *
 * The point comes from an explicit `:at{#id}` marker in the :::say, or else is
 * matched from the words of the sentence being spoken (see pointMatcher).
 *
 * DOM-only and dependency-free (like hydrate.ts) so the same code runs in the
 * viewer and in an exported standalone page. Styles live in components.css
 * under "Present mode".
 */

import { smoothScrollBy } from './motion'
import { parseLineRanges } from './ranges'
import { DEFAULT_LANG, defaultVoice, narrationFile, speechText } from './speech'

export interface AtMarker {
  /** Index of the sentence the marker sits in; the point holds until the next marker */
  sentence: number
  id?: string
  lines?: Set<number>
}

export interface Segment {
  /** Cue ids to spotlight */
  on: string[]
  note: string
  /** 1-based code lines to light inside the cued code block(s) */
  lines?: Set<number>
  say: string
  /** Explicit :at markers; when present they replace word matching for this segment */
  at: AtMarker[]
  /** Language and generated-audio voice of the enclosing :::narration */
  lang: string
  voice: string
}

export interface PresentOptions {
  /** Start speaking immediately (needs a user gesture, e.g. the click that opened present mode) */
  autoplay?: boolean
  /** Called after the presenter has torn itself down (Esc or the close button) */
  onExit?: () => void
}

export interface Presenter {
  /** Re-read segments and cues after the root's content was re-rendered */
  refresh(): void
  exit(): void
}

// 10 ms of silence, for unlocking audio elements without making a sound.
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='
const VOICE_KEY = 'em-present-voice'
const RATE_KEY = 'em-present-rate'
const CAPTIONS_KEY = 'em-present-captions'
const CAPTION_POS_KEY = 'em-present-caption-pos'
/** Where the caption sits: in the dock, or floating just above / below the lit section */
const CAPTION_POSITIONS = ['bar', 'above', 'below'] as const
type CaptionPos = typeof CAPTION_POSITIONS[number]
const CAPTION_POS_ICON: Record<CaptionPos, string> = { bar: 'call_to_action', above: 'vertical_align_top', below: 'vertical_align_bottom' }
/** px between the lit section and a floating caption, and the narrowest a floating caption gets */
const CAPTION_GAP = 12
const CAPTION_MIN_WIDTH = 360
const KOKORO = 'kokoro'
const PAUSE_BETWEEN_SEGMENTS_MS = 650
const RATES = [0.8, 0.9, 1, 1.15, 1.3, 1.5]
const WORDS_PER_MINUTE = 150
/** Section rail: px left of the lit block, and the widest gap between blocks that still share one rail */
const RAIL_GAP = 14
const RAIL_JOIN = 28
// The items a lit block is made of — what "which point is being read" chooses between.
const POINT = 'li, tr:has(td), .step, .timeline-event, .card, dt, details, g.node'

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/** Split narration into sentences; "1.9.10" and "e.g." mid-word never split. */
export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean)
}

/** Rank voices: Edge "Natural" first, then other neural/online voices, then common English locales. */
export function voiceScore(v: { name: string; lang: string }): number {
  return (/natural/i.test(v.name) ? 4 : 0) +
    (/online|google|neural/i.test(v.name) ? 2 : 0) +
    (/^en-(US|GB|AU)/i.test(v.lang) ? 1 : 0)
}

export function hasNarration(root: ParentNode): boolean {
  return root.querySelector('.em-say') !== null
}

const MARK = /(\d+)/

/**
 * Speech text with `n` placeholders where the :at markers were → the
 * sentence each marker falls in. A marker right after a sentence's last character
 * belongs to the next sentence ("…done. :at{#b} Next…" points at "Next").
 */
export function locateMarkers(raw: string): { text: string; marks: Array<{ n: number; sentence: number }> } {
  let text = ''
  const offsets: Array<{ n: number; at: number }> = []
  for (const part of raw.split(MARK)) {
    const m = part.match(/^(\d+)$/)
    if (m) offsets.push({ n: Number(m[1]), at: text.length })
    // A removed marker leaves two spaces behind; speechText would have collapsed them.
    else text += text === '' || text.endsWith(' ') ? part.replace(/^\s+/, '') : part
  }
  text = text.trimEnd()
  const sentences = splitSentences(text)
  const starts: number[] = []
  let from = 0
  for (const s of sentences) {
    const i = text.indexOf(s, from)
    starts.push(i)
    from = i + s.length
  }
  const marks = offsets.map(({ n, at }) => {
    let k = 0
    while (k + 1 < starts.length && at >= starts[k] + sentences[k].length) k++
    return { n, sentence: k }
  })
  return { text, marks }
}

const STOPWORDS = new Set((
  'the and for with that this these those from into onto then than when what which who whom there ' +
  'their they them have has had was were are but not you your our its also just only each here more ' +
  'most some such very will would can could should about after before over under once again all any ' +
  'both other same too out off one two three four five first second third fourth fifth next last ' +
  'finally step steps now how why where does did done been being ' +
  'của các những một này được cho với không là và thì khi đây đó có trong cũng rằng như đầu tiên thứ'
).split(' '))

/** Comparable word keys: lower-case, stop words out, a crude stem (plural s, first 5 letters). */
function wordKeys(text: string): Set<string> {
  const keys = new Set<string>()
  for (const w of text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 3 || STOPWORDS.has(w)) continue
    keys.add((w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w).slice(0, 5))
  }
  return keys
}

/** "First, …" → 0, "Third …" → 2, "Finally …" → -1 (the last point); Vietnamese too. */
export function ordinalOf(sentence: string): number | undefined {
  const en = sentence.match(/^(?:(?:and|so|then|the)\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|finally|lastly)\b/i)
  const vi = sentence.match(/^(?:và\s+)?(đầu tiên|thứ nhất|thứ hai|thứ ba|thứ tư|thứ năm|thứ sáu|thứ bảy|thứ tám|cuối cùng)(?=[\s,.:;!?]|$)/i)
  const word = (en ?? vi)?.[1].toLowerCase()
  if (!word) return undefined
  const order = ['first|đầu tiên|thứ nhất', 'second|thứ hai', 'third|thứ ba', 'fourth|thứ tư', 'fifth|thứ năm',
    'sixth|thứ sáu', 'seventh|thứ bảy', 'eighth|thứ tám', 'ninth', 'tenth']
  if (/^(finally|lastly|cuối cùng)$/.test(word)) return -1
  const i = order.findIndex(o => o.split('|').includes(word))
  return i < 0 ? undefined : i
}

/**
 * Which of `points` (their text) a spoken sentence is about, or -1 when it's unclear.
 * Shared words score by how few points contain them, a leading ordinal ("Second, …")
 * adds a bonus, and the winner must clearly beat the runner-up — a wrong highlight is
 * worse than none.
 */
export function pointMatcher(points: string[]): (sentence: string) => number {
  const n = points.length
  const keys = points.map(wordKeys)
  const df = new Map<string, number>()
  keys.forEach(ks => ks.forEach(k => df.set(k, (df.get(k) ?? 0) + 1)))
  return sentence => {
    if (n < 2) return -1
    const said = wordKeys(sentence)
    const scores = keys.map(ks => {
      let s = 0
      said.forEach(k => { if (ks.has(k)) s += (n - df.get(k)! + 1) / n })
      return s
    })
    const ord = ordinalOf(sentence)
    if (ord !== undefined) {
      const i = ord < 0 ? n - 1 : ord
      if (i < n) scores[i] += 1.5
    }
    const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a])
    return scores[order[0]] >= 1 && scores[order[0]] - scores[order[1]] >= 0.5 ? order[0] : -1
  }
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Base name of the markdown file: stamped on <body> by Export to HTML (the .html may be
 * saved under another name); in the preview, <base href> is the .md file itself.
 */
function docName(): string {
  const file = document.body.dataset.emDoc ?? decodeURIComponent(new URL(document.baseURI).pathname.split('/').pop() ?? '')
  return file.replace(/\.[^.]*$/, '')
}

function narrationVoice(el: HTMLElement): { lang: string; voice: string } {
  const n = el.closest<HTMLElement>('.em-narration')
  const lang = n?.dataset.lang || DEFAULT_LANG
  return { lang, voice: n?.dataset.voice || defaultVoice(lang) }
}

function readAtMarkers(say: HTMLElement): AtMarker[] {
  const clone = say.cloneNode(true) as HTMLElement
  const spans = Array.from(clone.querySelectorAll<HTMLElement>('.em-at'))
  if (!spans.length) return []
  spans.forEach((s, n) => s.replaceWith(`${n}`))
  const { text, marks } = locateMarkers(speechText(clone.innerHTML))
  // Should never differ; if it does, sentence indexes would be off — use word matching instead.
  if (text !== say.dataset.speech) return []
  return marks.map(({ n, sentence }) => ({
    sentence,
    id: spans[n].dataset.at,
    lines: spans[n].dataset.lines ? parseLineRanges(spans[n].dataset.lines!) : undefined,
  }))
}

export function readSegments(root: ParentNode): Segment[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.em-say')).map(el => ({
    on: (el.dataset.on ?? '').split(/\s+/).filter(Boolean),
    note: el.dataset.note ?? '',
    lines: el.dataset.lines ? parseLineRanges(el.dataset.lines) : undefined,
    say: el.dataset.speech ?? '',
    at: readAtMarkers(el),
    ...narrationVoice(el),
  }))
}

// ─── Cue resolution ─────────────────────────────────────────────────────────

/** The block an inline :cue marks: its row, heading, list item or paragraph. */
function cueBlock(marker: HTMLElement): HTMLElement | null {
  const scope = marker.dataset.cueScope
  if (scope === 'list') return marker.closest('ul, ol')
  if (scope === 'table') return marker.closest('table')
  return marker.closest('tr') ??
    marker.closest('h1, h2, h3, h4, h5, h6') ??
    marker.closest('li') ??
    marker.closest('p, dt, dd, blockquote') ??
    marker.parentElement
}

function indexCues(root: HTMLElement): Map<string, HTMLElement[]> {
  const cues = new Map<string, HTMLElement[]>()
  root.querySelectorAll<HTMLElement>('[data-cue]').forEach(el => {
    if (el.closest('.em-narration')) return
    const block = el.classList.contains('em-cue') ? cueBlock(el) : el
    if (!block || !root.contains(block)) return
    const id = el.dataset.cue!
    const list = cues.get(id) ?? []
    if (!list.includes(block)) list.push(block)
    cues.set(id, list)
  })
  return cues
}

function codeLines(el: HTMLElement, lines: Set<number>): HTMLElement[] {
  const block = el.matches('.code-block') ? el : el.querySelector<HTMLElement>('.code-block')
  const code = block?.querySelector('code')
  if (!code) return []
  // Document order, not direct children: an hljs span that crosses a newline makes the
  // browser nest the next line's span inside this one, but start tags stay in line order.
  const all = code.querySelectorAll<HTMLElement>('.hl, .code-line, .em-ln')
  return Array.from(all).filter((_, i) => lines.has(i + 1))
}

interface Resolved { lit: HTMLElement[]; missing: string[] }

function resolveSegment(seg: Segment, cues: Map<string, HTMLElement[]>): Resolved {
  const lit: HTMLElement[] = []
  const missing: string[] = []
  for (const id of seg.on) {
    const els = cues.get(id)
    if (!els) { missing.push(id); continue }
    for (const el of els) {
      const lines = seg.lines ? codeLines(el, seg.lines) : []
      lit.push(...(lines.length ? lines : [el]))
    }
  }
  return { lit, missing }
}

/** Visible, outermost points inside the lit blocks: a step's own list items belong to the step. */
function pointCandidates(lit: HTMLElement[]): Element[] {
  const all = new Set<Element>()
  for (const el of lit) el.querySelectorAll(POINT).forEach(p => { if (p.getClientRects().length) all.add(p) })
  const list = Array.from(all)
  return list.filter(p => !list.some(q => q !== p && q.contains(p)))
}

function resolveAt(m: AtMarker, lit: HTMLElement[], cues: Map<string, HTMLElement[]>): Element[] {
  // No id: the lines are in the code block(s) the segment already lights.
  const targets = m.id
    ? cues.get(m.id) ?? []
    : Array.from(new Set(lit.map(el => el.closest<HTMLElement>('.code-block') ?? el)))
  return targets.flatMap(el => m.lines ? codeLines(el, m.lines) : [el])
}

/** The focused point for each sentence of a segment; a point holds until another replaces it. */
function planPoints(seg: Segment, lit: HTMLElement[], cues: Map<string, HTMLElement[]>): Element[][] {
  const plan: Element[][] = []
  let cur: Element[] = []
  const sentences = splitSentences(seg.say)
  if (seg.at.length) {
    sentences.forEach((_, k) => {
      for (const m of seg.at) if (m.sentence === k) cur = resolveAt(m, lit, cues)
      plan.push(cur)
    })
    return plan
  }
  const points = pointCandidates(lit)
  const match = pointMatcher(points.map(p => p.textContent ?? ''))
  for (const s of sentences) {
    const i = match(s)
    if (i >= 0) cur = [points[i]]
    plan.push(cur)
  }
  return plan
}

/** Each narrated block (a code block for its lines) → the first segment that spotlights it. */
function indexJumps(segments: Segment[], cues: Map<string, HTMLElement[]>): Map<HTMLElement, number> {
  const jumps = new Map<HTMLElement, number>()
  segments.forEach((seg, i) => {
    for (const el of resolveSegment(seg, cues).lit) {
      // A lit code line jumps via its code block (VS Code also stamps .code-line on prose).
      const block = el.closest('pre') ? el.closest<HTMLElement>('.code-block') ?? el : el
      if (!jumps.has(block)) jumps.set(block, i)
    }
  })
  return jumps
}

// ─── Presenter ──────────────────────────────────────────────────────────────

const icon = (name: string): string => `<span class="material-symbols-outlined">${name}</span>`

export function startPresent(root: HTMLElement, opts: PresentOptions = {}): Presenter | null {
  let segments = readSegments(root)
  if (!segments.length) return null

  let cues = indexCues(root)
  let jumps = indexJumps(segments, cues)
  let words = segments.map(s => splitSentences(s.say).map(countWords))
  let idx = 0
  let sent = 0           // sentence of the current segment that plays next (or is playing)
  let begun = false      // has `sent` been reached yet, or is the segment still at its start?
  let parts: string[] = []
  let lit: HTMLElement[] = []
  let focused: Element[] = []
  let playing = false
  let token = 0          // bumps on every stop/seek so stale speech callbacks bail out
  let timers: number[] = []
  let voices: SpeechSynthesisVoice[] = []
  let speechBroken = false
  let rate = Number(storage(RATE_KEY)) || 1
  let scrolledAt = 0
  let captionPos: CaptionPos = CAPTION_POSITIONS.find(p => p === storage(CAPTION_POS_KEY)) ?? 'bar'
  // A small pool that takes turns: the current clip plus the next two, buffering ahead. A clip
  // must play from the element that buffered it — each element streams its own range requests,
  // so swapping a preloaded URL into another element downloads it again. Not fetch()+blob: the
  // preview's CSP has no connect-src and no blob: in media-src.
  // VS Code's webview only lets a media element play if a click or key started it once, so a
  // fresh Audio() per sentence is blocked; the pool is unlocked on the gesture that starts play.
  const pool = [new Audio(), new Audio(), new Audio()]
  pool.forEach(p => { p.preload = 'auto' })
  const unlocked = new Set<HTMLAudioElement>()
  let player = pool[0]
  const synth: SpeechSynthesis | undefined = 'speechSynthesis' in window ? window.speechSynthesis : undefined
  const scroller = findScroller(root)

  // ── UI ──
  const bar = document.createElement('div')
  bar.className = 'em-present-bar'
  bar.innerHTML = `
    <div class="em-present-note"></div>
    <div class="em-present-caption" aria-live="polite"></div>
    <div class="em-present-track" role="group" aria-label="Segments"></div>
    <div class="em-present-controls">
      <div class="em-present-transport">
        <button type="button" data-act="prev" title="Previous segment (←)" aria-label="Previous segment">${icon('skip_previous')}</button>
        <button type="button" data-act="play" class="em-present-main" title="Play / pause (Space)"></button>
        <button type="button" data-act="next" title="Next segment (→)" aria-label="Next segment">${icon('skip_next')}</button>
        <button type="button" data-act="restart" title="Restart this segment (R)" aria-label="Restart this segment">${icon('replay')}</button>
      </div>
      <div class="em-present-status">
        <span class="em-present-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="em-present-count"></span>
        <span class="em-present-left"></span>
      </div>
      <div class="em-present-options">
        <button type="button" data-act="rate" class="em-present-rate" title="Speed (− / +)"></button>
        <button type="button" data-act="captions" title="Captions on / off (C)" aria-label="Captions">${icon('subtitles')}</button>
        <button type="button" data-act="caption-pos" title="Caption position: dock / above / below the section (P)" aria-label="Caption position"></button>
        <label class="em-present-voice" title="Voice">${icon('record_voice_over')}<select data-act="voice"></select></label>
        <button type="button" data-act="exit" title="Exit (Esc)" aria-label="Exit present mode">${icon('close')}</button>
      </div>
    </div>`
  // Section rail: a bar in the left gutter beside each run of lit blocks. An overlay, not a
  // pseudo-element on the block, because tables and code blocks clip their own overflow.
  const rails = document.createElement('div')
  rails.className = 'em-present-rails'
  // Floating caption box: holds the caption while it sits above/below the section.
  const float = document.createElement('div')
  float.className = 'em-present-float'
  document.body.append(bar, rails, float)

  const $ = <T extends HTMLElement>(sel: string) => bar.querySelector<T>(sel)!
  const note = $('.em-present-note')
  const caption = $('.em-present-caption')
  const track = $('.em-present-track')
  const playBtn = $<HTMLButtonElement>('[data-act="play"]')
  const voiceSel = $<HTMLSelectElement>('[data-act="voice"]')
  const rateBtn = $<HTMLButtonElement>('[data-act="rate"]')

  root.classList.add('em-presenting')
  bar.classList.toggle('em-no-captions', storage(CAPTIONS_KEY) === 'off')
  rateBtn.textContent = `${rate}×`
  applyCaptionPos()

  // ── Voices ──
  function loadVoices(): void {
    const all = synth?.getVoices() ?? []
    const lang = segments[0].lang
    const match = all.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
    // Never fall back to another language's voice: an English voice reading Vietnamese is worse than silent captions.
    voices = match.sort((a, b) => voiceScore(b) - voiceScore(a))
    const saved = storage(VOICE_KEY)
    voiceSel.innerHTML = `<option value="${KOKORO}" title="Pre-generated with npm run narrate">Generated audio</option>` + (voices.length
      ? voices.map((v, i) => `<option value="${i}"${v.name === saved ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('')
      : '<option value="">Captions only (no voice)</option>')
  }
  loadVoices()
  synth?.addEventListener('voiceschanged', loadVoices)

  // ── Segment track: one tick per segment, as wide as its narration is long ──
  function buildTrack(): void {
    track.innerHTML = segments.map((s, i) => {
      const n = words[i].reduce((a, b) => a + b, 0)
      const tip = `${i + 1}. ${s.note || s.say.split(/\s+/).slice(0, 7).join(' ') + '…'}`
      return `<button type="button" class="em-present-tick" data-seg="${i}" style="flex-grow:${Math.max(n, 4)}" ` +
        `data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"><i></i></button>`
    }).join('')
  }

  function paintTrack(): void {
    track.querySelectorAll<HTMLElement>('.em-present-tick').forEach((t, i) => {
      t.classList.toggle('em-done', i < idx)
      t.classList.toggle('em-cur', i === idx)
      t.querySelector('i')!.style.width = i < idx ? '100%' : '0'
    })
  }

  /** Fill the current tick to the word being spoken (or the start of the current sentence). */
  function paintProgress(wordsIn = 0): void {
    const seg = words[idx]
    const total = seg.reduce((a, b) => a + b, 0) || 1
    const done = seg.slice(0, Math.min(sent, seg.length)).reduce((a, b) => a + b, 0) + wordsIn
    const tick = track.querySelectorAll<HTMLElement>('.em-present-tick')[idx]
    if (tick) tick.querySelector('i')!.style.width = `${Math.min(100, (done / total) * 100)}%`
  }

  function paintLeft(): void {
    const left = words.slice(idx + 1).flat().reduce((a, b) => a + b, 0) +
      words[idx].slice(sent).reduce((a, b) => a + b, 0)
    const secs = (left / (WORDS_PER_MINUTE * rate)) * 60
    $('.em-present-left').textContent = secs < 45 ? 'almost done' : `~${Math.max(1, Math.round(secs / 60))} min left`
  }

  // ── Spotlight: the section ring and, inside it, the point being read ──
  function clearSpotlight(): void {
    root.querySelectorAll('.em-lit, .em-point, .em-seekable').forEach(el =>
      el.classList.remove('em-lit', 'em-point', 'em-seekable'))
    focused = []
  }

  function markJumps(on: boolean): void {
    root.querySelectorAll('.em-jump').forEach(el => el.classList.remove('em-jump'))
    if (on) jumps.forEach((_, el) => el.classList.add('em-jump'))
  }

  function pointPlan(): Element[][] {
    return planPoints(segments[idx], lit, cues)
  }

  function focusPoint(els: Element[]): void {
    if (els.length === focused.length && els.every((el, i) => el === focused[i])) return
    focused.forEach(el => el.classList.remove('em-point'))
    focused = els
    els.forEach(el => el.classList.add('em-point'))
    placeRails()
    if (els.length) keepVisible(els)
  }

  /** One rail per run of lit blocks; blocks closer than RAIL_JOIN share a rail.
   *  Each point gets a bright stretch of its rail, spanning its tint (halo included). */
  function placeRails(): void {
    // Rails live in the scrolled content, so they scroll natively; measure from their origin.
    const origin = rails.getBoundingClientRect()
    const runs: { top: number; bottom: number; left: number }[] = []
    lit.map(el => ({ r: el.getBoundingClientRect(), left: gutterLeft(el) })).filter(b => b.r.height > 0)
      .sort((a, b) => a.r.top - b.r.top)
      .forEach(({ r, left }) => {
        const run = runs[runs.length - 1]
        if (run && r.top - run.bottom < RAIL_JOIN) {
          run.bottom = Math.max(run.bottom, r.bottom)
          run.left = Math.min(run.left, left)
        } else runs.push({ top: r.top, bottom: r.bottom, left })
      })
    const lines = rails.getElementsByTagName('i')
    while (lines.length > runs.length) lines[lines.length - 1].remove()
    while (lines.length < runs.length) rails.append(document.createElement('i'))
    const railLeft = (run: { left: number }): number => Math.max(4, run.left - RAIL_GAP) - origin.left
    runs.forEach((run, i) => {
      lines[i].style.cssText =
        `top:${run.top - origin.top}px;left:${railLeft(run)}px;height:${run.bottom - run.top}px`
    })

    // Rows and code lines are tinted flush, without the halo
    const halo = parseFloat(getComputedStyle(root).getPropertyValue('--present-point-halo')) || 0
    const thumbs = focused.flatMap(el => {
      const r = el.getBoundingClientRect()
      const mid = (r.top + r.bottom) / 2
      const run = runs.find(run => mid >= run.top && mid <= run.bottom)
      if (!run || r.height === 0) return []
      const pad = el.matches('tr, g.node, .code-block *') ? 0 : halo
      return [{ top: r.top - pad, bottom: r.bottom + pad, left: railLeft(run) }]
    })
    const bars = rails.getElementsByTagName('b')
    while (bars.length > thumbs.length) bars[bars.length - 1].remove()
    while (bars.length < thumbs.length) rails.append(document.createElement('b'))
    thumbs.forEach((t, i) => {
      bars[i].style.cssText = `top:${t.top - origin.top}px;left:${t.left}px;height:${t.bottom - t.top}px`
    })
    placeCaption()
  }

  /** Where a block visibly starts, for its rail. List bullets/numbers hang outside the list's
   *  box, in its indent; task items pull their checkbox out past the list's edge; and a block
   *  inside a quote or callout would otherwise put its rail on that container's left border. */
  function gutterLeft(el: Element): number {
    const lists = [...el.querySelectorAll('ul, ol')]
    const own = el.matches('li') ? el.parentElement : el.matches('ul, ol') ? el : null
    if (own) lists.push(own)
    const edges = lists.flatMap(list => {
      const item = list.querySelector(':scope > li')
      if (!item) return []
      const left = item.getBoundingClientRect().left
      const s = getComputedStyle(item)
      if (s.listStyleType === 'none' || s.listStylePosition === 'inside') return [left]
      const ls = getComputedStyle(list)
      return [left - parseFloat(ls.marginLeft) - parseFloat(ls.paddingLeft)]
    })
    const frame = el.parentElement?.closest('blockquote, .callout')
    if (frame && root.contains(frame)) edges.push(frame.getBoundingClientRect().left)
    return Math.min(el.getBoundingClientRect().left, ...edges)
  }

  /** Park a floating caption just above/below the lit section, kept inside the visible area
   *  (so a section taller than the screen still has its caption on screen). */
  function placeCaption(): void {
    float.hidden = captionPos === 'bar' || bar.classList.contains('em-no-captions')
    if (float.hidden) return
    const rects = lit.map(el => el.getBoundingClientRect()).filter(r => r.height > 0)
    if (!rects.length) return
    const origin = rails.getBoundingClientRect()
    const view = viewBox()
    const top = Math.min(...rects.map(r => r.top))
    const bottom = Math.max(...rects.map(r => r.bottom))
    const left = Math.min(...rects.map(r => r.left))
    const right = Math.max(...rects.map(r => r.right))
    const width = Math.min(Math.max(right - left, CAPTION_MIN_WIDTH), window.innerWidth - 16)
    const h = float.offsetHeight
    const y = clamp(captionPos === 'above' ? top - h - CAPTION_GAP : bottom + CAPTION_GAP,
      view.top + 8, Math.max(view.top + 8, view.bottom - h - 8))
    const x = clamp(left, 8, window.innerWidth - width - 8)
    float.style.cssText = `top:${y - origin.top}px;left:${x - origin.left}px;width:${width}px`
  }

  /** The visible part of the scroller, above the dock. */
  function viewBox(): { top: number; bottom: number } {
    const view = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect()
    return { top: view.top, bottom: Math.min(view.bottom, bar.getBoundingClientRect().top) }
  }

  /** The view minus room for a floating caption, so scrolling leaves it space beside the section. */
  function focusBox(): { top: number; bottom: number } {
    const view = viewBox()
    const room = float.hidden ? 0 : float.offsetHeight + CAPTION_GAP
    if (captionPos === 'above') view.top += room
    else if (captionPos === 'below') view.bottom -= room
    return view
  }

  function scrollToFocus(els: Element[]): void {
    if (!els.length) return
    const r = unionRect(els)
    const view = focusBox()
    const avail = view.bottom - view.top
    const delta = r.bottom - r.top > avail - 48
      ? r.top - view.top - 24
      : (r.top + r.bottom) / 2 - (view.top + avail / 2)
    smoothScrollBy(scroller, delta)
    scrolledAt = performance.now()
  }

  /** Scroll a point into view only if it's off screen — and not while a scroll is still gliding. */
  function keepVisible(els: Element[]): void {
    const wait = scrolledAt + 700 - performance.now()
    if (wait > 0) {
      window.setTimeout(() => { if (focused === els && root.classList.contains('em-presenting')) keepVisible(els) }, wait)
      return
    }
    const r = unionRect(els)
    const view = focusBox()
    if (r.top < view.top + 8 || r.bottom > view.bottom - 8) scrollToFocus(els)
  }

  // ── Segment display ──
  function show(i: number): void {
    idx = clamp(i, 0, segments.length - 1)
    sent = 0
    begun = false
    const seg = segments[idx]
    parts = splitSentences(seg.say)
    const resolved = resolveSegment(seg, cues)
    lit = resolved.lit
    clearSpotlight()
    lit.forEach(el => el.classList.add('em-lit'))
    pointPlan().flat().forEach(el => el.classList.add('em-seekable'))
    renderCaption(-1)  // before placing: the new text sets a floating caption's height
    placeRails()
    scrollToFocus(lit)

    const { missing } = resolved
    const warn = missing.length ? `⚠ cue not found: ${missing.join(', ')}` : ''
    const text = [seg.note, warn].filter(Boolean).join('\n')
    note.classList.toggle('em-warn', missing.length > 0)
    note.textContent = text

    $('.em-present-count').textContent = `${idx + 1} / ${segments.length}`
    paintTrack()
    paintLeft()
  }

  /** Make sentence k the current one: caption, point, progress. */
  function setSentence(k: number): void {
    sent = k
    begun = true
    renderCaption(k)
    const line = caption.querySelector<HTMLElement>('.em-cur')
    if (line) smoothScrollBy(caption, line.offsetTop - caption.offsetTop - caption.scrollTop)
    focusPoint(pointPlan()[k] ?? [])
    paintProgress()
    paintLeft()
  }

  function renderCaption(cur: number, wordStart = 0, wordLen = 0): void {
    caption.innerHTML = parts.map((p, i) => {
      const t = i === cur && wordLen
        ? escapeHtml(p.slice(0, wordStart)) +
          `<span class="em-present-word">${escapeHtml(p.slice(wordStart, wordStart + wordLen))}</span>` +
          escapeHtml(p.slice(wordStart + wordLen))
        : escapeHtml(p)
      return `<span class="em-present-sentence${i === cur ? ' em-cur' : i < cur ? ' em-said' : ''}">${t}</span>`
    }).join(' ')
    if (cur >= 0 && wordLen) paintProgress(countWords(parts[cur].slice(0, wordStart)))
  }

  // ── Speech ──
  function clearTimers(): void {
    timers.forEach(t => clearTimeout(t))
    timers = []
  }

  function later(fn: () => void, ms: number): void {
    timers.push(window.setTimeout(fn, ms))
  }

  /** Speak from sentence `sent`; `resume` continues a paused generated clip where it stopped. */
  function speak(resume = false): void {
    const my = ++token
    clearTimers()
    synth?.cancel()
    stopAudio()
    if (sent >= parts.length) { sent = 0; resume = false }  // finished: play again from the top of the segment
    const seg = segments[idx]
    let k = sent
    let cont = resume

    const nextSentence = (): void => {
      if (my !== token || !playing) return
      if (k >= parts.length) {
        if (idx < segments.length - 1) {
          later(() => { if (my === token && playing) { show(idx + 1); speak() } }, PAUSE_BETWEEN_SEGMENTS_MS)
        } else {
          sent = parts.length
          paintProgress()
          setPlaying(false)
        }
        return
      }
      const cur = k++
      setSentence(cur)
      const browserSpeak = (): void => {
        const voice = voices[voiceSel.value === KOKORO ? 0 : Number(voiceSel.value)]
        if (synth && voice && !speechBroken) speakVoice(cur, voice, my, nextSentence)
        else speakTimed(cur, my, nextSentence)
      }
      if (voiceSel.value === KOKORO) speakAudio(cur, seg.voice, my, nextSentence, browserSpeak, cont)
      else browserSpeak()
      cont = false
    }
    nextSentence()
  }

  /** Pre-generated audio (npm run narrate); a sentence with no file (not generated yet) falls back. */
  function speakAudio(cur: number, voice: string, my: number, done: () => void, fallback: () => void, cont: boolean): void {
    const url = clipUrl(voice, parts[cur])
    // Prefer the element that buffered this clip; one never unlocked would be refused play().
    const buffered = pool.find(p => p.src === url && unlocked.has(p))
    if (buffered && buffered !== player) { stopAudio(); player = buffered }
    const a = player
    // Re-assigning src restarts the clip, so a resumed sentence keeps the one it paused in.
    if (a.src !== url) a.src = url
    // Skip a no-op seek on a freshly buffered clip: over file:// any seek re-reads the file.
    else if (!cont && a.currentTime) a.currentTime = 0
    a.playbackRate = rate
    const ws = Array.from(parts[cur].matchAll(/\S+/g))
    // No word timings from a WAV: advance the highlight evenly through the clip.
    a.ontimeupdate = () => {
      if (my !== token || !a.duration) return
      const w = ws[Math.min(ws.length - 1, Math.floor(a.currentTime / a.duration * ws.length))]
      if (w) renderCaption(cur, w.index ?? 0, w[0].length)
    }
    a.onended = () => { if (my === token) done() }
    let failed = false
    const fail = (why: string): void => {
      if (failed || my !== token) return
      failed = true
      console.warn(`[present] generated audio failed (${why}), falling back: ${url}\n  "${parts[cur]}"`)
      fallback()
    }
    a.onerror = () => fail(`media error ${a.error?.code}: ${a.error?.message ?? ''}`)
    a.play().then(() => { unlocked.add(a); preloadAfter(cur, voice) }, (e: Error) => fail(`play() ${e.name}: ${e.message}`))
  }

  function clipUrl(voice: string, sentence: string): string {
    return new URL(narrationFile(docName(), voice, sentence), document.baseURI).href
  }

  /** Buffer the next two clips (crossing into the next segment) in the idle pool elements. */
  function preloadAfter(cur: number, voice: string): void {
    const ahead = pool.length - 1
    const next: { voice: string; sentence: string }[] = parts.slice(cur + 1, cur + 1 + ahead)
      .map(sentence => ({ voice, sentence }))
    for (let i = idx + 1; next.length < ahead && i < segments.length; i++) {
      splitSentences(segments[i].say).slice(0, ahead - next.length)
        .forEach(sentence => next.push({ voice: segments[i].voice, sentence }))
    }
    const urls = next.map(n => clipUrl(n.voice, n.sentence))
    // Leave already-buffering elements alone; only reassign ones holding a stale clip.
    const free = pool.filter(p => p !== player && !urls.includes(p.src))
    urls.filter(u => !pool.some(p => p.src === u)).forEach((u, i) => { if (free[i]) free[i].src = u })
  }

  /** Called from the click/key that starts playback: play() on each idle element once so it may play later. */
  function unlockPool(): void {
    pool.forEach(p => {
      if (p === player || unlocked.has(p)) return
      p.src = SILENT_WAV
      p.play().then(() => { p.pause(); unlocked.add(p) }, () => { /* no gesture (autoplay): stays locked */ })
    })
  }

  function stopAudio(): void {
    player.onended = player.onerror = player.ontimeupdate = null
    player.pause()
  }

  // One utterance per sentence: Chrome cuts off long utterances, and it lets the caption track progress.
  function speakVoice(cur: number, voice: SpeechSynthesisVoice, my: number, done: () => void): void {
    const u = new SpeechSynthesisUtterance(parts[cur])
    u.voice = voice
    u.rate = rate
    let started = false
    u.onstart = () => { started = true }
    u.onboundary = e => {
      if (my !== token || e.name !== 'word') return
      const len = e.charLength || (parts[cur].slice(e.charIndex).match(/^\S+/) ?? [''])[0].length
      renderCaption(cur, e.charIndex, len)
    }
    u.onend = () => { if (my === token) done() }
    u.onerror = e => { if (my === token && e.error !== 'interrupted' && e.error !== 'canceled') done() }
    synth!.speak(u)
    // Some engines list voices but never start speaking; fall back to timed captions.
    later(() => {
      if (started || my !== token) return
      speechBroken = true
      synth!.cancel()
      speakTimed(cur, my, done)
    }, 4000)
  }

  /** No usable voice: step the caption word by word at a natural reading pace. */
  function speakTimed(cur: number, my: number, done: () => void): void {
    const ws = Array.from(parts[cur].matchAll(/\S+/g))
    const msPerWord = 60000 / (170 * rate)
    ws.forEach((w, n) => later(() => {
      if (my === token) renderCaption(cur, w.index ?? 0, w[0].length)
    }, n * msPerWord))
    later(() => { if (my === token) done() }, Math.max(1200, ws.length * msPerWord + 250))
  }

  function setPlaying(p: boolean, resume = true): void {
    playing = p
    bar.classList.toggle('em-playing', p)
    playBtn.innerHTML = icon(p ? 'pause' : 'play_arrow')
    playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play')
    if (p) { unlockPool(); speak(resume) }
    else { token++; clearTimers(); synth?.cancel(); stopAudio() }
  }

  function go(d: number): void { show(idx + d); if (playing) speak() }
  function jump(i: number): void { show(i); if (playing) speak() }
  /** R: this segment again, from its first sentence, playing. */
  function restart(): void { show(idx); setPlaying(true, false) }

  /** Move to sentence k of the current segment, spilling into the neighbours at either end. */
  function seek(k: number): void {
    if (k >= parts.length) {
      if (idx >= segments.length - 1) return
      show(idx + 1)
      k = 0
    } else if (k < 0) {
      if (idx === 0) return
      show(idx - 1)
      k = Math.max(0, parts.length - 1)
    }
    sent = k
    if (playing) speak()
    else setSentence(k)
  }

  function setRate(r: number): void {
    rate = r
    pool.forEach(p => { p.playbackRate = r })
    rateBtn.textContent = `${r}×`
    storage(RATE_KEY, String(r))
    paintLeft()
  }

  function stepRate(d: number): void {
    const i = RATES.findIndex(r => r >= rate)
    setRate(RATES[clamp((i < 0 ? RATES.length - 1 : i) + d, 0, RATES.length - 1)])
  }

  function toggleCaptions(): void {
    const off = bar.classList.toggle('em-no-captions')
    storage(CAPTIONS_KEY, off ? 'off' : 'on')
    onMove()
  }

  /** Move the caption element itself between the dock and the floating box. */
  function applyCaptionPos(): void {
    if (captionPos === 'bar') note.after(caption)
    else float.append(caption)
    $('[data-act="caption-pos"]').innerHTML = icon(CAPTION_POS_ICON[captionPos])
    placeCaption()
  }

  function cycleCaptionPos(): void {
    captionPos = CAPTION_POSITIONS[(CAPTION_POSITIONS.indexOf(captionPos) + 1) % CAPTION_POSITIONS.length]
    storage(CAPTION_POS_KEY, captionPos)
    applyCaptionPos()
    keepVisible(lit)
  }

  // ── Events ──
  // Clicking a bar button must not focus it, or the next Space would press it again.
  bar.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault()
  })
  bar.addEventListener('click', e => {
    const t = e.target as HTMLElement
    const seg = t.closest<HTMLElement>('[data-seg]')?.dataset.seg
    if (seg !== undefined) { jump(Number(seg)); return }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act
    if (act === 'prev') go(-1)
    else if (act === 'next') go(1)
    else if (act === 'play') setPlaying(!playing)
    else if (act === 'restart') restart()
    else if (act === 'rate') setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)
    else if (act === 'captions') toggleCaptions()
    else if (act === 'caption-pos') cycleCaptionPos()
    else if (act === 'exit') exit()
  })
  voiceSel.addEventListener('change', () => {
    const v = voices[Number(voiceSel.value)]
    if (voiceSel.value === KOKORO || v) storage(VOICE_KEY, v ? v.name : KOKORO)
    speechBroken = false
    // Hand the keys back: a focused <select> would swallow Space and the arrows.
    voiceSel.blur()
    if (playing) speak()
  })

  // Click a point being narrated to hear it from there; click another narrated block to jump to it.
  const onRootClick = (e: MouseEvent): void => {
    const plan = pointPlan()
    for (let el = e.target as Element | null; el && el !== root; el = el.parentElement) {
      const k = plan.findIndex(pts => pts.includes(el!))
      if (k >= 0) { seek(k); return }
      const j = el instanceof HTMLElement ? jumps.get(el) : undefined
      // The current section itself: R restarts it; a stray click (or text selection) shouldn't.
      if (j !== undefined) { if (j !== idx) jump(j); return }
    }
  }
  root.addEventListener('click', onRootClick)

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target instanceof Element ? e.target : document.body
    if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input, select, textarea, [contenteditable]')) return
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (key === ' ') {
      if (t.closest('button, a, summary')) return  // a focused control handles its own Space
      e.preventDefault()
      setPlaying(!playing)
    }
    else if (key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? seek(begun ? sent + 1 : 0) : go(1) }
    else if (key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? seek(sent - 1) : go(-1) }
    else if (key === 'r') restart()
    else if (key === 'c') toggleCaptions()
    else if (key === 'p') cycleCaptionPos()
    else if (key === '-') stepRate(-1)
    else if (key === '+' || key === '=') stepRate(1)
    else if (key === 'Home') { e.preventDefault(); jump(0) }
    else if (key === 'Escape') exit()
  }
  document.addEventListener('keydown', onKey)

  let raf = 0
  const onMove = (): void => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(placeRails)
  }
  document.addEventListener('scroll', onMove, true)
  window.addEventListener('resize', onMove)
  // Late layout shifts (a mermaid diagram rendering, an image loading) move the lit blocks.
  const resizes = new ResizeObserver(onMove)
  resizes.observe(root)
  const onUnload = (): void => { synth?.cancel(); stopAudio() }
  window.addEventListener('beforeunload', onUnload)

  function exit(): void {
    setPlaying(false)
    clearSpotlight()
    markJumps(false)
    root.classList.remove('em-presenting')
    root.removeEventListener('click', onRootClick)
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('scroll', onMove, true)
    window.removeEventListener('resize', onMove)
    resizes.disconnect()
    window.removeEventListener('beforeunload', onUnload)
    synth?.removeEventListener('voiceschanged', loadVoices)
    bar.remove()
    rails.remove()
    float.remove()
    opts.onExit?.()
  }

  function refresh(): void {
    setPlaying(false)
    segments = readSegments(root)
    if (!segments.length) { exit(); return }
    cues = indexCues(root)
    jumps = indexJumps(segments, cues)
    words = segments.map(s => splitSentences(s.say).map(countWords))
    // A re-render may have replaced <body>'s children (VS Code's morphdom), UI included.
    if (!bar.isConnected) document.body.append(bar)
    if (!rails.isConnected) document.body.append(rails)
    if (!float.isConnected) document.body.append(float)
    buildTrack()
    markJumps(true)
    root.classList.add('em-presenting')
    show(idx)
  }

  // Whatever opened present mode (e.g. a toolbar button) gives up focus so Space means play/pause.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  buildTrack()
  markJumps(true)
  show(0)
  setPlaying(!!opts.autoplay)
  return { refresh, exit }
}

let launched: Presenter | null = null

/**
 * A floating Present button, plus (for standalone pages) a start card — browsers
 * only allow speech after a click. Safe to call after every re-render: it refreshes
 * a running presenter and re-adds a button a re-render removed.
 */
export function mountPresentLauncher(root: HTMLElement, opts: { startCard?: boolean } = {}): void {
  const count = readSegments(root).length
  let launch = document.querySelector<HTMLButtonElement>('.em-present-launch')
  if (!count) {
    launched?.exit()
    launch?.remove()
    return
  }
  launched?.refresh()

  const begin = (): void => {
    document.querySelector<HTMLElement>('.em-present-launch')?.setAttribute('hidden', '')
    launched = startPresent(root, {
      autoplay: true,
      onExit: () => {
        launched = null
        document.querySelector<HTMLElement>('.em-present-launch')?.removeAttribute('hidden')
      },
    })
  }

  if (!launch) {
    launch = document.createElement('button')
    launch.type = 'button'
    launch.className = 'em-present-launch'
    launch.innerHTML = `${icon('slideshow')} Present`
    launch.addEventListener('click', begin)
    document.body.append(launch)
  }
  launch.hidden = launched !== null

  if (!opts.startCard) return
  const title = root.querySelector('h1')?.textContent?.trim() || document.title
  const start = document.createElement('div')
  start.className = 'em-present-start'
  start.innerHTML = `
    <div class="em-present-start__card">
      <h3>${escapeHtml(title)}</h3>
      <p>A narrated walkthrough in ${count} segments.</p>
      <button type="button">${icon('play_arrow')} Start presentation</button>
      <small>Space play/pause · ← → segment · Shift+← → sentence · R restart segment · C captions · P caption position · − + speed · Esc exit.<br>
      Click a highlighted item to hear it again. Best browser voices: Microsoft Edge ("Natural").</small>
    </div>`
  start.addEventListener('click', e => {
    const onButton = (e.target as HTMLElement).closest('button')
    // Clicking the backdrop means "just let me read".
    if (!onButton && (e.target as HTMLElement).closest('.em-present-start__card')) return
    start.remove()
    if (onButton) begin()
  })
  document.body.append(start)
}

// ─── DOM utilities ──────────────────────────────────────────────────────────

/** Read (and with a value, write) a saved setting; storage can be unavailable (sandboxed webviews, file://). */
function storage(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value)
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function findScroller(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return document.scrollingElement ?? document.documentElement
}

function unionRect(els: Element[]): { top: number; bottom: number } {
  const rects = els.map(e => e.getBoundingClientRect())
  return { top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
