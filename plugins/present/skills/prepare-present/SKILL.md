---
name: prepare-present
description: >
  Triggers: "prepare a presentation / talk / walkthrough about X", "draft the
  presentation but don't narrate", "just write the presentation doc", "present / narrate
  this doc to me". Writes a self-presenting blueprint-markdown document (page +
  :::narration script) — NEW, or by adding a script to an existing doc — WITHOUT
  generating audio. The present skill runs this, then narrates.
---

Output is a self-playing explainer: viewers press **Present** and a neutral narrator talks
them through it, alone, without you there. The page is the slide; the narration is the talk.

Load the `blueprint-markdown` skill for directive syntax (and `mermaid-diagrams` for
diagrams). The narration syntax is below — only this skill knows it.

**Adding narration to an existing doc** (no new page): do §0, §3 and §4 step 1 only (about 20–25 segments for a two-page doc; one `:::say` per idea). Leave the rest of the
document unchanged apart from the names, so it reads and renders exactly as before.

---

## 0. Narration syntax

Present mode: a `:::narration` script gives the doc a **Present** button — a voiced
walkthrough that rings each segment's blocks, highlights the item inside being discussed,
shows a margin note and captions the speech. Names and script are invisible without it.

**Name the blocks** the script points at:

| Target | How |
|--------|-----|
| Any directive (callout, event, step, card, col, …) | `{#id}` in its attrs: `:::event{#t3 date="v1"}` |
| Code block | `#id` after the language: ` ```php {3-6} #fix title="A.php" ` |
| Heading, paragraph, table row, list item | `:cue{#id}` at the end of its text: `\| **What you see** :cue{#see} \|` |
| Whole list / table | `:cue{#id list}` / `:cue{#id table}` in its first item / cell |

Same id on several blocks lights them together. Name a heading with `:cue`, never a trailing
`{#id}` (that only works inside `:::explorer`; elsewhere it prints literally). `:cue` takes
`#` like every name — `:cue{see}` renders nothing.

**Script** — one `:::narration` at the **end** of the file, one `:::say` per segment, in
playing order:

```
:::narration
:::say{on="answer" note="Fixed and proven on a real migrate"}
Here's the short version. Both bugs are fixed. The proof is a real migrate.
:::
:::say{on="try3 fix" lines="3-5" note="Flag set in the same run"}
:at{#try3} Try 3 is the final version. :at{lines="4"} If roles were already mapped, it returns early.
:::
:::
```

| Attr | Meaning |
|------|---------|
| `on` | space-separated ids to spotlight; every id must name a block, or it lights nothing |
| `lines` | 1-based lines to light inside the named code block(s); same ranges as `{3-6}` |
| `note` | margin note, one line; keep `{` `}` out of values |

`:::narration{lang="vi"}` narrates in Vietnamese; `voice=` overrides the generated-audio
voice. The body is spoken and captioned — plain prose, no markdown or tables; split into
sentences at `.` `!` `?` + space (`1.9.10` stays whole). `:at{#id}` / `:at{lines="4"}` before
a sentence pins the highlight (not spoken); see §3.

Playback: Space play/pause · ← → prev/next · Esc exit · click a narrated block to jump.

---

## 1. Before writing — settle these

| Ask / infer | Default |
|---|---|
| **Source** — a topic, or material to convert (doc, PR, code, notes)? Read the material first. | — |
| **Audience** — who watches, what they already know | Engineers on the team |
| **Language** — `:::narration{lang="vi"}` for Vietnamese (voice Hải Đăng), omit for English (Kokoro) | Language of the request |
| **Length** | 10 minutes |
| **The one sentence** they should remember | Must exist before writing; ask if unclear |
| **Output path** | Next to the source, `<name>-presentation.md` |

Budget from length: **~150 spoken words a minute, one segment per 20–30 seconds.**
10 minutes ≈ 1,500 words ≈ 20–30 segments.

---

## 2. Shape of the document

Fixed arc — each part is one `##` section:

1. **Hook** — the problem, or why this matters now. One callout or one number.
2. **The answer** — the conclusion, in the first 30 seconds of narration. Don't build suspense.
3. **Key points** — 3 to 5 sections, one idea each, each backed by a visual block.
4. **Risks and open questions** — its own section, said plainly.
5. **Next step** — the ask or decision. Not a recap.

Page rules:

- **Show, don't describe.** Every section leads with the richest visual that fits, and the
  narration points at it; paragraphs are one to two lines, the last resort.

  | Content | Visual | Name it |
  |---|---|---|
  | UI, results | screenshot `![alt](img/x.png)` (a real file, path relative to the doc) | `:cue{#id}` after the image, same paragraph |
  | Flow, structure, dependencies | ` ```mermaid #id ` (`mermaid-diagrams` picks the type), or `:::explorer` when each node needs detail | fence `#id` |
  | A change | ` ```diff #id ` or a before/after table | fence `#id` / `:cue{#id table}` |
  | Comparison, numbers | table | `:cue{#id table}` |
  | Sequence, history | `:::steps` / `:::timeline` | `{#id}` |

  Never invent a screenshot path — no real image, use a diagram or table instead.
- **Show relationships, not lists.** Draw what calls, causes or replaces what — diagram
  arrows, before → after — and narrate the link ("the cache feeds the retry loop"), not each
  part alone. Refer back to earlier sections by their heading so the parts join up.
- **One idea per section, one lit block per segment.** If a segment would light three
  scattered blocks, split it or regroup the page.
- **The page must still read without audio** — headings are claims ("Retries fixed the
  timeout"), not topics ("Retries").
- Code blocks: keep them under ~15 lines and light only the lines being discussed (`lines=`).

---

## 3. Writing the narration

Voice: **neutral narrator**, third person or "we" for the project. Never "I", never stage
directions — nobody is there to follow them.

| Rule | Instead of | Write |
|---|---|---|
| Say why, the page shows what | "This table has three rows: A, B, C." | "Only B survives the load test. That's why we chose it." |
| 8–15 words a sentence | one sentence with three clauses | three sentences |
| Signpost | "Another thing is…" | "Three changes. First, …" |
| Spell out for the ear | `getUserById()`, `v4 → v5`, `~2x`, `/api/users`, `150 ms` | "get user by ID", "version 4 to 5", "about twice", "the users endpoint", "150 milliseconds" |
| Acronyms stay solid capitals | "A P I", "A I" — a lone "A" is read as "uh" | "API", "AI", "MCP" — the voice spells them letter by letter |
| Commas are pauses | "However the cache was stale" | "However, the cache was stale." |
| No leading numbers or symbols | "42% of calls failed." | "Of all calls, forty two percent failed." |
| Numbers rounded and compared | "3,847 ms" | "almost four seconds, three times the budget" |

**Vietnamese (`lang="vi"`)** — the voice reads English words, but plainly:

- Keep established English tech terms as words (cache, API, commit, deploy); don't force a translation nobody says.
- Code identifiers still get spoken form: `getUserById` → "hàm lấy người dùng theo I D", not the raw name.
- Numbers and units in words: "3,8 giây" → "gần bốn giây"; "v4 → v5" → "phiên bản bốn lên năm".
- Full diacritics always — "khong" instead of "không" is read as a different word.
- Headings, notes and page text stay in Vietnamese too; mixing languages across page and voice confuses.

- **Open segment:** the one sentence. **Close segment:** the next step, then stop.
- **Notes (`note=`)** are the viewer's takeaway in ≤ 8 words — the key number or claim.
  Risk segments get `note="⚠ …"`.
- Never sound more certain than the evidence. Say what was measured, and what wasn't.
- **Pin the spotlight with `:at`; don't leave it to auto-detect.** Auto-detect guesses from
  "First, …" or shared words and misses paraphrase. Put `:at{#id}` (an item named inside the
  segment's `on=` blocks) or `:at{lines="4"}` (lit code) before each sentence that moves to a
  new item. A pin holds until the next — one per shift, not per sentence.
- **Diagram nodes:** pin one by the id you gave it in the source — `:at{#auth}` for
  `auth[Auth]` (flowchart, state and class diagrams only; other types number nodes by position).

---

## 4. Finish — verify, don't assume

1. Run `blueprint-markdown`'s `validate.mjs` on the file once — must pass; it reports `on=` and `:at{#id}` ids naming nothing.
2. Word count of all `:::say` bodies within ±15 % of the length budget.
3. **Do not run narrate.** Report: file path, segment count, estimated minutes, and that
   audio isn't generated yet — `npm run narrate -- <file>` (or the present skill) does that.
   Until then Present mode falls back to the browser voice.

Worked example: [assets/example.md](assets/example.md).
