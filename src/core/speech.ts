/**
 * speech.ts — the spoken text of a :::say and the file name of its generated audio.
 *
 * Shared by the renderer (stamps data-speech), present.ts (plays the audio) and
 * scripts/narrate.mjs (generates it), so all three agree on the exact sentence text
 * that the audio file name is hashed from.
 */

/** Narration language → default voice. `en` is Kokoro; `vi` is VieNeu-TTS (scripts/vieneu_narrate.py). */
export const DEFAULT_VOICES: Record<string, string> = { en: 'af_heart', vi: 'Hải Đăng' }
export const DEFAULT_LANG = 'en'

export function defaultVoice(lang: string): string {
  return DEFAULT_VOICES[lang] ?? DEFAULT_VOICES[DEFAULT_LANG]
}

export const NARRATION_DIR = '.narration'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Rendered say HTML → plain text; block ends become spaces so paragraphs don't run together. */
export function speechText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|div|tr|td|th|blockquote|pre|dt|dd)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** cyrb53 — a stable, sync hash (crypto.subtle is async and missing on file://). */
function hash53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Relative path of one sentence's audio, next to the markdown file. */
export function narrationFile(voice: string, sentence: string): string {
  // VieNeu voice names are Vietnamese ("Hải Đăng"); keep file names ASCII.
  const slug = voice.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .replace(/[^a-z0-9_]+/gi, '-').toLowerCase()
  return `${NARRATION_DIR}/${slug}-${hash53(sentence)}.wav`
}
