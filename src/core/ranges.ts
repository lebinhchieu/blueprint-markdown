/**
 * ranges.ts — Parse a line-range list like "1,3-5,7" into a set of 1-based line numbers.
 *
 * Shared by the fence renderer ({1,3-5} highlight) and the presenter (lines="3-5"),
 * kept separate from fence.ts so the presenter bundle doesn't pull in highlight.js.
 */

export function parseLineRanges(raw: string): Set<number> {
  const lines = new Set<number>()
  for (const part of raw.split(',')) {
    const p = part.trim()
    const range = p.match(/^(\d+)-(\d+)$/)
    if (range) {
      const from = parseInt(range[1], 10)
      const to = parseInt(range[2], 10)
      for (let n = from; n <= to; n++) lines.add(n)
    } else {
      const single = parseInt(p, 10)
      if (!isNaN(single)) lines.add(single)
    }
  }
  return lines
}
