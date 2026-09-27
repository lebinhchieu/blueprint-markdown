/**
 * present.ts — Present mode: a narrated walkthrough of a rendered document.
 *
 * Call startPresent(root) on a DOM that contains rendered :::narration output.
 * It reads the hidden .em-say segments, spotlights each segment's cued blocks
 * (everything else dims, parent containers stay visible), shows a margin note,
 * and speaks the narration sentence by sentence with a synced caption bar.
 *
 * DOM-only and dependency-free (like hydrate.ts) so the same code runs in the
 * viewer and in an exported standalone page. Styles live in components.css
 * under "Present mode".
 */

import { parseLineRanges } from './ranges'
import { DEFAULT_LANG, defaultVoice, narrationFile } from './speech'

export interface Segment {
  /** Cue ids to spotlight */
  on: string[]
  note: string
  /** 1-based code lines to light inside the cued code block(s) */
  lines?: Set<number>
  say: string
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

const VOICE_KEY = 'em-present-voice'
const KOKORO = 'kokoro'
const PAUSE_BETWEEN_SEGMENTS_MS = 650
// Header-like children that keep full opacity so a lit row/line still has its context.
const KEEP_CONTEXT = 'thead, .code-title, .callout__header, .step__title, .timeline-event__marker'
// The presenter's own UI lives in <body>, which is also the root in the VS Code preview.
const PRESENT_UI = '.em-present-bar, .em-present-note, .em-present-launch, .em-present-start'

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

function narrationVoice(el: HTMLElement): { lang: string; voice: string } {
  const n = el.closest<HTMLElement>('.em-narration')
  const lang = n?.dataset.lang || DEFAULT_LANG
  return { lang, voice: n?.dataset.voice || defaultVoice(lang) }
}

export function readSegments(root: ParentNode): Segment[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.em-say')).map(el => ({
    on: (el.dataset.on ?? '').split(/\s+/).filter(Boolean),
    note: el.dataset.note ?? '',
    lines: el.dataset.lines ? parseLineRanges(el.dataset.lines) : undefined,
    say: el.dataset.speech ?? '',
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

export function startPresent(root: HTMLElement, opts: PresentOptions = {}): Presenter | null {
  let segments = readSegments(root)
  if (!segments.length) return null

  let cues = indexCues(root)
  let jumps = indexJumps(segments, cues)
  let idx = 0
  let playing = false
  let token = 0          // bumps on every stop/seek so stale speech callbacks bail out
  let timers: number[] = []
  let voices: SpeechSynthesisVoice[] = []
  let speechBroken = false
  // One element for every sentence: VS Code's webview only lets a media element play if a
  // click or key started it once, so a fresh Audio() per sentence is blocked after the first.
  const player = new Audio()
  const synth: SpeechSynthesis | undefined = 'speechSynthesis' in window ? window.speechSynthesis : undefined
  const scroller = findScroller(root)

  // ── UI ──
  const bar = document.createElement('div')
  bar.className = 'em-present-bar'
  bar.innerHTML = `
    <div class="em-present-progress"><div></div></div>
    <div class="em-present-caption" aria-live="polite"></div>
    <div class="em-present-controls">
      <button type="button" data-act="prev" title="Previous (←)" aria-label="Previous"><span class="material-symbols-outlined">skip_previous</span></button>
      <button type="button" data-act="play" class="em-present-main" title="Play / pause (Space)"></button>
      <button type="button" data-act="next" title="Next (→)" aria-label="Next"><span class="material-symbols-outlined">skip_next</span></button>
      <button type="button" data-act="replay" title="Replay this segment" aria-label="Replay"><span class="material-symbols-outlined">replay</span></button>
      <label>Voice <select data-act="voice"></select></label>
      <label>Speed <input data-act="rate" type="range" min="0.7" max="1.6" step="0.05" value="1.05"><span class="em-present-rate">1.05×</span></label>
      <span class="em-present-count"></span>
      <button type="button" data-act="exit" title="Exit (Esc)" aria-label="Exit present mode"><span class="material-symbols-outlined">close</span></button>
    </div>`
  const note = document.createElement('div')
  note.className = 'em-present-note'
  document.body.append(bar, note)

  const $ = <T extends HTMLElement>(sel: string) => bar.querySelector<T>(sel)!
  const caption = $('.em-present-caption')
  const playBtn = $<HTMLButtonElement>('[data-act="play"]')
  const voiceSel = $<HTMLSelectElement>('[data-act="voice"]')
  const rateIn = $<HTMLInputElement>('[data-act="rate"]')

  root.classList.add('em-presenting')

  // ── Voices ──
  function loadVoices(): void {
    const all = synth?.getVoices() ?? []
    const lang = segments[0].lang
    const match = all.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
    // Never fall back to another language's voice: an English voice reading Vietnamese is worse than silent captions.
    voices = match.sort((a, b) => voiceScore(b) - voiceScore(a))
    const saved = storage('get')
    voiceSel.innerHTML = `<option value="${KOKORO}">Generated (npm run narrate)</option>` + (voices.length
      ? voices.map((v, i) => `<option value="${i}"${v.name === saved ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('')
      : '<option value="">Captions only (no voice)</option>')
  }
  loadVoices()
  synth?.addEventListener('voiceschanged', loadVoices)

  // ── Spotlight ──
  function clearSpotlight(): void {
    root.querySelectorAll('.em-lit, .em-has-lit, .em-dim, .em-dim-inner').forEach(el =>
      el.classList.remove('em-lit', 'em-has-lit', 'em-dim', 'em-dim-inner'))
  }

  function markJumps(on: boolean): void {
    root.querySelectorAll('.em-jump').forEach(el => el.classList.remove('em-jump'))
    if (on) jumps.forEach((_, el) => el.classList.add('em-jump'))
  }

  function spotlight(lit: HTMLElement[]): void {
    clearSpotlight()
    const containers = new Set<HTMLElement>([root])
    for (const el of lit) {
      el.classList.add('em-lit')
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        p.classList.add('em-has-lit')
        containers.add(p)
      }
    }
    if (!lit.length) return
    for (const c of containers) {
      for (const child of Array.from(c.children)) {
        if (child.matches('.em-lit, .em-has-lit, .em-narration') || child.matches(KEEP_CONTEXT) || child.matches(PRESENT_UI)) continue
        child.classList.add(c === root ? 'em-dim' : 'em-dim-inner')
      }
    }
  }

  let noteFor: HTMLElement[] = []
  function placeNote(): void {
    if (!noteFor.length || !note.classList.contains('em-on')) return
    const r = unionRect(noteFor)
    // The content column's right edge: the root minus its padding (the VS Code preview pads <body>).
    const contentRight = root.getBoundingClientRect().right - parseFloat(getComputedStyle(root).paddingRight)
    const barTop = bar.getBoundingClientRect().top
    const w = note.offsetWidth
    const fits = contentRight + 12 + w <= window.innerWidth - 8
    note.style.left = `${fits ? contentRight + 12 : Math.max(8, contentRight - w - 8)}px`
    note.style.top = `${clamp(r.top, 64, barTop - note.offsetHeight - 12)}px`
  }

  function scrollToFocus(els: HTMLElement[]): void {
    if (!els.length) return
    const r = unionRect(els)
    const view = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect()
    const bottom = Math.min(view.bottom, bar.getBoundingClientRect().top)
    const avail = bottom - view.top
    const delta = r.bottom - r.top > avail - 48
      ? r.top - view.top - 24
      : (r.top + r.bottom) / 2 - (view.top + avail / 2)
    const target = scroller === document.scrollingElement ? window : scroller
    target.scrollBy({ top: delta, behavior: 'smooth' })
  }

  // ── Segment display ──
  function show(i: number): void {
    idx = clamp(i, 0, segments.length - 1)
    const seg = segments[idx]
    const { lit, missing } = resolveSegment(seg, cues)
    spotlight(lit)
    scrollToFocus(lit)

    const warn = missing.length ? `⚠ cue not found: ${missing.join(', ')}` : ''
    const text = [seg.note, warn].filter(Boolean).join('\n')
    note.classList.remove('em-on')
    note.classList.toggle('em-warn', missing.length > 0)
    note.textContent = text
    // With nothing lit, a warning still needs an anchor: the top of the document.
    noteFor = lit.length ? lit : [root]
    if (text) requestAnimationFrame(() => { note.classList.add('em-on'); placeNote() })

    $('.em-present-count').textContent = `${idx + 1} / ${segments.length}`
    $<HTMLElement>('.em-present-progress > div').style.width = `${((idx + 1) / segments.length) * 100}%`
    renderCaption(splitSentences(seg.say), -1)
  }

  function renderCaption(parts: string[], cur: number, wordStart = 0, wordLen = 0): void {
    caption.innerHTML = parts.map((p, i) => {
      const t = i === cur && wordLen
        ? escapeHtml(p.slice(0, wordStart)) +
          `<mark class="em-present-word">${escapeHtml(p.slice(wordStart, wordStart + wordLen))}</mark>` +
          escapeHtml(p.slice(wordStart + wordLen))
        : escapeHtml(p)
      return `<span class="em-present-sentence${i === cur ? ' em-cur' : ''}">${t}</span>`
    }).join(' ')
  }

  // ── Speech ──
  function clearTimers(): void {
    timers.forEach(t => clearTimeout(t))
    timers = []
  }

  function later(fn: () => void, ms: number): void {
    timers.push(window.setTimeout(fn, ms))
  }

  function speak(): void {
    const my = ++token
    clearTimers()
    synth?.cancel()
    stopAudio()
    const parts = splitSentences(segments[idx].say)
    let k = 0

    const nextSentence = (): void => {
      if (my !== token || !playing) return
      if (k >= parts.length) {
        if (idx < segments.length - 1) {
          later(() => { if (my === token && playing) { show(idx + 1); speak() } }, PAUSE_BETWEEN_SEGMENTS_MS)
        } else {
          setPlaying(false)
        }
        return
      }
      const cur = k++
      renderCaption(parts, cur)
      const browserSpeak = (): void => {
        const voice = voices[voiceSel.value === KOKORO ? 0 : Number(voiceSel.value)]
        if (synth && voice && !speechBroken) speakVoice(parts, cur, voice, my, nextSentence)
        else speakTimed(parts, cur, my, nextSentence)
      }
      if (voiceSel.value === KOKORO) speakAudio(parts, cur, segments[idx].voice, my, nextSentence, browserSpeak)
      else browserSpeak()
    }
    nextSentence()
  }

  /** Pre-generated audio (npm run narrate); a sentence with no file (not generated yet) falls back. */
  function speakAudio(parts: string[], cur: number, voice: string, my: number, done: () => void, fallback: () => void): void {
    const url = new URL(narrationFile(voice, parts[cur]), document.baseURI).href
    const a = player
    a.src = url
    a.playbackRate = Number(rateIn.value)
    const words = Array.from(parts[cur].matchAll(/\S+/g))
    // No word timings from a WAV: advance the highlight evenly through the clip.
    a.ontimeupdate = () => {
      if (my !== token || !a.duration) return
      const w = words[Math.min(words.length - 1, Math.floor(a.currentTime / a.duration * words.length))]
      if (w) renderCaption(parts, cur, w.index ?? 0, w[0].length)
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
    a.play().catch((e: Error) => fail(`play() ${e.name}: ${e.message}`))
  }

  function stopAudio(): void {
    player.onended = player.onerror = player.ontimeupdate = null
    player.pause()
  }

  // One utterance per sentence: Chrome cuts off long utterances, and it lets the caption track progress.
  function speakVoice(parts: string[], cur: number, voice: SpeechSynthesisVoice, my: number, done: () => void): void {
    const u = new SpeechSynthesisUtterance(parts[cur])
    u.voice = voice
    u.rate = Number(rateIn.value)
    let started = false
    u.onstart = () => { started = true }
    u.onboundary = e => {
      if (my !== token || e.name !== 'word') return
      const len = e.charLength || (parts[cur].slice(e.charIndex).match(/^\S+/) ?? [''])[0].length
      renderCaption(parts, cur, e.charIndex, len)
    }
    u.onend = () => { if (my === token) done() }
    u.onerror = e => { if (my === token && e.error !== 'interrupted' && e.error !== 'canceled') done() }
    synth!.speak(u)
    // Some engines list voices but never start speaking; fall back to timed captions.
    later(() => {
      if (started || my !== token) return
      speechBroken = true
      synth!.cancel()
      speakTimed(parts, cur, my, done)
    }, 4000)
  }

  /** No usable voice: step the caption word by word at a natural reading pace. */
  function speakTimed(parts: string[], cur: number, my: number, done: () => void): void {
    const sentence = parts[cur]
    const words = Array.from(sentence.matchAll(/\S+/g))
    const msPerWord = 60000 / (170 * Number(rateIn.value))
    words.forEach((w, n) => later(() => {
      if (my === token) renderCaption(parts, cur, w.index ?? 0, w[0].length)
    }, n * msPerWord))
    later(() => { if (my === token) done() }, Math.max(1200, words.length * msPerWord + 250))
  }

  function setPlaying(p: boolean): void {
    playing = p
    playBtn.innerHTML = p
      ? '<span class="material-symbols-outlined">pause</span> Pause'
      : '<span class="material-symbols-outlined">play_arrow</span> Play'
    if (p) speak()
    else { token++; clearTimers(); synth?.cancel(); stopAudio() }
  }

  function go(d: number): void { show(idx + d); if (playing) speak() }
  function replay(): void { show(idx); if (playing) speak() }

  // ── Events ──
  // Clicking a bar button must not focus it, or the next Space would press it again.
  bar.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault()
  })
  bar.addEventListener('click', e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    if (act === 'prev') go(-1)
    else if (act === 'next') go(1)
    else if (act === 'play') setPlaying(!playing)
    else if (act === 'replay') replay()
    else if (act === 'exit') exit()
  })
  voiceSel.addEventListener('change', () => {
    const v = voices[Number(voiceSel.value)]
    if (voiceSel.value === KOKORO || v) storage('set', v ? v.name : KOKORO)
    speechBroken = false
    replay()
  })
  rateIn.addEventListener('input', () => {
    player.playbackRate = Number(rateIn.value)
    $('.em-present-rate').textContent = `${Number(rateIn.value).toFixed(2)}×`
  })

  // Click a narrated block to jump to the first segment that spotlights it.
  const onRootClick = (e: MouseEvent): void => {
    for (let el = e.target as HTMLElement | null; el && el !== root; el = el.parentElement) {
      const j = jumps.get(el)
      if (j !== undefined) { show(j); if (playing) speak(); return }
    }
  }
  root.addEventListener('click', onRootClick)

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target instanceof Element ? e.target : document.body
    if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input, select, textarea, [contenteditable]')) return
    if (e.key === ' ') {
      if (t.closest('button, a, summary')) return  // a focused control handles its own Space
      e.preventDefault()
      setPlaying(!playing)
    }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
    else if (e.key === 'Escape') exit()
  }
  document.addEventListener('keydown', onKey)

  let raf = 0
  const onMove = (): void => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(placeNote)
  }
  document.addEventListener('scroll', onMove, true)
  window.addEventListener('resize', onMove)
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
    window.removeEventListener('beforeunload', onUnload)
    synth?.removeEventListener('voiceschanged', loadVoices)
    bar.remove()
    note.remove()
    opts.onExit?.()
  }

  function refresh(): void {
    setPlaying(false)
    segments = readSegments(root)
    if (!segments.length) { exit(); return }
    cues = indexCues(root)
    jumps = indexJumps(segments, cues)
    // A re-render may have replaced <body>'s children (VS Code's morphdom), UI included.
    if (!bar.isConnected) document.body.append(bar)
    if (!note.isConnected) document.body.append(note)
    markJumps(true)
    root.classList.add('em-presenting')
    show(idx)
  }

  // Whatever opened present mode (e.g. a toolbar button) gives up focus so Space means play/pause.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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
    launch.innerHTML = '<span class="material-symbols-outlined">slideshow</span> Present'
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
      <button type="button"><span class="material-symbols-outlined">play_arrow</span> Start presentation</button>
      <small>Keys: Space play/pause · ← → previous/next · Esc exit.<br>Best voices: Microsoft Edge ("Natural" voices).</small>
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

/** The saved voice name; storage can be unavailable (sandboxed webviews, file:// in some browsers). */
function storage(op: 'get' | 'set', value?: string): string | null {
  try {
    if (op === 'set') localStorage.setItem(VOICE_KEY, value ?? '')
    return localStorage.getItem(VOICE_KEY)
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

function unionRect(els: HTMLElement[]): { top: number; bottom: number } {
  const rects = els.map(e => e.getBoundingClientRect())
  return { top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
