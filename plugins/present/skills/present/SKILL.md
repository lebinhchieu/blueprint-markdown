---
name: present
description: >
  Triggers: "make a presentation / talk / walkthrough / explainer about X", "turn this
  (doc, PR, code, notes) into a presentation". Writes a NEW blueprint-markdown document
  built to present itself: Kokoro narrates it, Present mode spotlights each block.
  Not for adding narration to an existing doc as-is — that's blueprint-markdown's
  "Present mode" section.
---

Output is a self-playing explainer: viewers press **Present** and a neutral narrator talks
them through it, alone, without you there. The page is the slide; the narration is the talk.

**Syntax lives in the blueprint-markdown skill** — directives, `{#id}` / `:cue{#id}` names,
`:::narration` / `:::say`, and its "Narration rules". Load it first. This skill only adds
what a presentation needs on top.

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

- **Visual first, prose last.** Every section leads with a block the narration can point at:
  a diagram, table, code block, steps, timeline or callout. Paragraphs are one to two lines.
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

---

## 4. Finish — verify, don't assume

1. Run `blueprint-markdown`'s `validate.mjs` on the file — must pass; fixes `on=` ids naming nothing.
2. Word count of all `:::say` bodies within ±15 % of the length budget.
3. From the enhanced-markdown-vscode repo: `npm run narrate -- <file>` generates the audio
   (Kokoro, or VieNeu for `vi` — one-time setup at the top of `scripts/narrate.mjs`) into
   `.narration/<doc>/` beside the file. Re-run; it must print `0 to generate`.
4. Report: file path, segment count, estimated minutes, and the narrate result. If narrate
   couldn't run, say so — Present mode then falls back to the browser voice.

Worked example: [assets/example.md](assets/example.md).
