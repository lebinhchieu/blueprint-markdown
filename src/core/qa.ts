/**
 * qa.ts — Browser-side state for :::question / :::option / :::qa-copy.
 *
 * Answers are never written to the markdown source. They persist in
 * localStorage under `em-qa:<doc>:<question id>` and are re-applied after every
 * render (VS Code's morphdom resets the DOM to its source defaults on each edit).
 * Listeners are delegated and wired once, so they survive node replacement.
 * Everything is keyed by question/option *id*, not DOM index.
 */

interface QaState {
  /** Selected option ids. */
  opts: string[]
  /** Free-text answer / extra remarks. */
  note: string
  /** User hit "Accept recommended" and hasn't changed the answer since. */
  accepted: boolean
}

const PREFIX = 'em-qa:'
let wired = false
const copyTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

// The source document's URI keeps answers separate per file in the preview;
// exported HTML has no preview settings, so fall back to its path.
const settingsRaw = document.getElementById('vscode-markdown-preview-data')?.getAttribute('data-settings')
let docKey = location.pathname
try { if (settingsRaw) docKey = JSON.parse(settingsRaw).source ?? docKey } catch { /* keep pathname */ }

// ─── Storage (all access guarded: blocked/private contexts throw) ────────────

function load(qid: string): QaState {
  try {
    const raw = localStorage.getItem(`${PREFIX}${docKey}:${qid}`)
    if (raw) {
      const s = JSON.parse(raw)
      return { opts: Array.isArray(s.opts) ? s.opts : [], note: String(s.note ?? ''), accepted: !!s.accepted }
    }
  } catch { /* fall through to empty */ }
  return { opts: [], note: '', accepted: false }
}

function save(qid: string, st: QaState): void {
  try { localStorage.setItem(`${PREFIX}${docKey}:${qid}`, JSON.stringify(st)) } catch { /* no persistence */ }
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

const allQuestions = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.question'))
const optionsOf = (q: HTMLElement): HTMLElement[] => Array.from(q.querySelectorAll<HTMLElement>('.question__option'))

function qidOf(q: HTMLElement): string {
  return q.dataset.qaId || `q${allQuestions().indexOf(q) + 1}`
}

function oidOf(q: HTMLElement, opt: HTMLElement): string {
  return opt.dataset.qaOpt || `o${optionsOf(q).indexOf(opt)}`
}

const isAnswered = (st: QaState): boolean => st.opts.length > 0 || st.note.trim() !== '' || st.accepted

// ─── Apply state to DOM ───────────────────────────────────────────────────────

function applyState(q: HTMLElement, st: QaState): void {
  for (const opt of optionsOf(q)) {
    const on = st.opts.includes(oidOf(q, opt))
    opt.toggleAttribute('data-selected', on)
    opt.querySelector('[data-qa-pick]')?.setAttribute('aria-pressed', String(on))
  }
  const ta = q.querySelector<HTMLTextAreaElement>('[data-qa-note]')
  if (ta && document.activeElement !== ta && ta.value !== st.note) ta.value = st.note
  q.toggleAttribute('data-accepted', st.accepted)
  q.querySelector('[data-qa-accept]')?.setAttribute('aria-pressed', String(st.accepted))
  q.toggleAttribute('data-answered', isAnswered(st))
}

function updateProgress(): void {
  const qs = allQuestions()
  const done = qs.filter(q => q.hasAttribute('data-answered')).length
  document.querySelectorAll<HTMLElement>('.qa-copy').forEach(bar => {
    const prog = bar.querySelector<HTMLElement>('[data-qa-progress]')
    if (prog) {
      prog.textContent = `${done}/${qs.length}`
      prog.title = `${done} of ${qs.length} answered`
    }
    const segs = bar.querySelector<HTMLElement>('[data-qa-segs]')
    if (!segs) return
    // morphdom may have wiped the segments (or the count changed): rebuild
    if (segs.children.length !== qs.length) {
      segs.textContent = ''
      qs.forEach((_, i) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'qa-copy__seg'
        b.setAttribute('data-qa-seg', String(i))
        b.appendChild(document.createElement('i'))
        segs.appendChild(b)
      })
    }
    qs.forEach((q, i) => {
      const seg = segs.children[i] as HTMLElement
      const ok = q.hasAttribute('data-answered')
      seg.toggleAttribute('data-done', ok)
      const label = `${[qidOf(q), q.dataset.qaTitle].filter(Boolean).join(' ')}: ${ok ? 'answered' : 'unanswered'}`
      seg.title = label
      seg.setAttribute('aria-label', label)
    })
  })
}

/** Re-apply persisted answers to every question. Call after each render. */
export function restoreQa(): void {
  for (const q of allQuestions()) applyState(q, load(qidOf(q)))
  updateProgress()
}

// ─── Copy text ────────────────────────────────────────────────────────────────

const indent = (s: string): string => s.split('\n').join('\n   ')

function recOptionIds(q: HTMLElement): string[] {
  return optionsOf(q).filter(o => o.hasAttribute('data-qa-rec')).map(o => oidOf(q, o))
}

function answerText(q: HTMLElement, st: QaState): string {
  const optNodes = optionsOf(q)
  const picked = optNodes.filter(o => st.opts.includes(oidOf(q, o)))
  const titles = picked.map(o => (o.dataset.qaTitle || oidOf(q, o)) + (o.hasAttribute('data-qa-rec') ? ' (recommended)' : ''))
  const note = st.note.trim()

  if (st.accepted) {
    const what = optNodes.length ? picked.map(o => o.dataset.qaTitle || oidOf(q, o)).join(', ') : q.dataset.qaRec ?? ''
    return `✅ accept recommended${what ? ` (${what})` : ''}` + (optNodes.length && note ? `\n   notes: ${indent(note)}` : '')
  }
  if (titles.length) return titles.join(', ') + (note ? `\n   notes: ${indent(note)}` : '')
  if (note) return indent(note)
  return '(unanswered)'
}

export function buildAnswers(): string {
  return allQuestions()
    .map(q => {
      const label = [qidOf(q), q.dataset.qaTitle].filter(Boolean).join(' ')
      return `${label}: ${answerText(q, load(qidOf(q)))}`
    })
    .join('\n')
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

function onClick(e: Event): void {
  const t = e.target as Element | null
  if (!t) return

  const pick = t.closest<HTMLElement>('[data-qa-pick]')
  if (pick) {
    const opt = pick.closest<HTMLElement>('.question__option')
    const q = opt?.closest<HTMLElement>('.question')
    if (!opt || !q) return
    const qid = qidOf(q)
    const oid = oidOf(q, opt)
    const st = load(qid)
    const had = st.opts.includes(oid)
    if (q.hasAttribute('data-qa-multi')) st.opts = had ? st.opts.filter(x => x !== oid) : [...st.opts, oid]
    else st.opts = had ? [] : [oid]
    st.accepted = false
    save(qid, st)
    applyState(q, st)
    updateProgress()
    return
  }

  const accept = t.closest<HTMLElement>('[data-qa-accept]')
  if (accept) {
    const q = accept.closest<HTMLElement>('.question')
    if (!q) return
    const qid = qidOf(q)
    const st = load(qid)
    if (st.accepted) {
      st.accepted = false
      if (optionsOf(q).length) st.opts = []
      else if (st.note === q.dataset.qaRec) {
        st.note = ''
        const ta = q.querySelector<HTMLTextAreaElement>('[data-qa-note]')
        if (ta) ta.value = ''
      }
      save(qid, st)
      applyState(q, st)
      updateProgress()
      return
    }
    if (optionsOf(q).length) {
      const recs = recOptionIds(q)
      if (!recs.length) return
      st.opts = q.hasAttribute('data-qa-multi') ? recs : recs.slice(0, 1)
    } else {
      const rec = q.dataset.qaRec
      if (!rec) return
      st.note = rec
      const ta = q.querySelector<HTMLTextAreaElement>('[data-qa-note]')
      if (ta) ta.value = rec
    }
    st.accepted = true
    save(qid, st)
    applyState(q, st)
    updateProgress()
    return
  }

  const seg = t.closest<HTMLElement>('[data-qa-seg]')
  if (seg) {
    const target = allQuestions()[Number(seg.dataset.qaSeg)]
    if (!target) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    target.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    return
  }

  const copy = t.closest<HTMLElement>('[data-qa-copy]')
  if (copy) {
    navigator.clipboard.writeText(buildAnswers()).then(() => {
      copy.setAttribute('data-copied', '')
      clearTimeout(copyTimers.get(copy))
      copyTimers.set(copy, setTimeout(() => copy.removeAttribute('data-copied'), 1500))
    }).catch(() => { /* clipboard blocked — no-op */ })
  }
}

function onInput(e: Event): void {
  const ta = e.target as HTMLTextAreaElement | null
  if (!ta || !ta.matches('[data-qa-note]')) return
  const q = ta.closest<HTMLElement>('.question')
  if (!q) return
  const qid = qidOf(q)
  const st = load(qid)
  st.note = ta.value
  // Editing the text of a text-only question overrides the accepted recommendation.
  if (!optionsOf(q).length) st.accepted = false
  save(qid, st)
  applyState(q, st)
  updateProgress()
}

/** Attach delegated listeners once. */
export function wireQa(): void {
  if (wired) return
  wired = true
  document.addEventListener('click', onClick)
  document.addEventListener('input', onInput)
}
