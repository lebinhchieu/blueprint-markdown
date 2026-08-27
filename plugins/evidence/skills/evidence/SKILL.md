---
name: evidence
description: Use when asked to "generate evidence", "prove this works", "capture evidence for these cases", or to produce a durable proof report (screenshots, API/DB output, command output) that a case/requirement was verified — for a reviewer, BA, or your own future reference. Also use mid-task, right after implementing something, when asked to document what was checked before calling it done.
---

# Evidence

Turn a list of verification cases into a single Blueprint Markdown report with the raw
proof (screenshot, API/DB output, command output) embedded per case, so a reviewer can see
what was checked without re-running it.

## When to use

- After finishing a feature/fix, to hand a reviewer/BA proof each case works.
- Mid-task, when asked to verify-and-document at the end of implementation — derive the
  case list yourself from what you just built/tested.
- Standalone QA pass against a case list someone hands you.

Not for: a quick one-off sanity check with no need for a lasting record — just check it and
say so in chat.

## Workflow

1. **Resolve cases** — from text given in chat, a checklist/plan file path, or (mid-task)
   derived from what was just implemented and tested.
2. **Route each case by type** and gather evidence:

   | Type | How to verify | Evidence captured |
   |------|----------------|--------------------|
   | UI | Drive `playwright-cli` (see that skill) | `snapshot`/`screenshot` file |
   | API | Run the request | method + full URL (including querystring, so it's copy-pasteable to retry) + params table (flat query/form params) or a pretty-printed JSON fence (when the request body is JSON) + pretty-printed JSON response — never a raw curl string |
   | DB | Use whatever query tool the project already has (psql/prisma/ORM script) — discover it, don't assume one | query + result rows as a markdown table |
   | CLI/build | Run the command | exit code + stdout/stderr |
   | File/artifact | Read the file | content excerpt or diff |
   | Other | Whatever's given | free-text description + raw output |

3. **Capture a verdict** — PASS or FAIL — per case, from the evidence gathered.
4. **Write the report** using `assets/report-template.md` as the skeleton, filled with the
   real cases (format below).
5. **Stamp run metadata** — read the existing `report.md` first, if present:
   - Get the real current timestamp via `date` (never guess/hallucinate a date).
   - Report level: new run number = previous report's run number + 1 (or `1` if no prior
     file). `Created` stays whatever the first-ever report recorded; `Last run` is always
     this new run number.
   - Per case, match by exact case-description text against the previous report:
     - Matched **and** actually (re-)verified this session → keep `Created`, bump `Last run`
       to the new report run number.
     - Matched but **not** re-verified this session → keep both `Created` and `Last run`
       exactly as they were.
     - No match (new case, or reworded) → both `Created` and `Last run` = the new report run
       number.
   - No prior `report.md` → report and every case start at `Run 1`.
   - **Run log:** carry forward every existing row from the previous report's `## Run log`
     table unchanged, then append exactly one new row: this run number, the current
     timestamp, and a one-line description of what happened this run (cases newly added,
     cases re-verified, why). Never edit or drop an old row — timestamps only live here,
     nowhere else.

## Report format

Copy `assets/report-template.md`, fill it in, run `blueprint-markdown`'s `validate.mjs` to
catch unclosed directives. Written in Blueprint Markdown — see that skill for syntax.

**Structure is fixed, regardless of the invoking session's output style** — the report
outlives this session and needs to read cleanly on its own. **Prose** (case descriptions,
`What was checked`, `Notes`) follows the `skimmable-writing` skill when it's available —
invoke it for the report's own writing style: one idea per sentence, bold the load-bearing
phrase first, facts as bullets/tables, never a paragraph.

- **Progress bar + summary table lead the file**, under a `## Summary` heading — the overall
  verdict is the deliverable, a reader should be able to stop there if that's all they need.
- **Per case:** a standalone `:::details{toc=h2 open}` block, no `:::accordion` wrapper —
  cases stay independently open so a reviewer can compare several at once. `toc=h2` turns the
  `title=` into a real heading, so `## Summary` and every case each get a TOC entry.
  - **Verdict:** `:chip[PASS]{success}`/`:chip[FAIL]{danger}` in the `title=` itself, not a
    callout box.
  - **Body:** `**What was checked:**` (one line) → evidence → `**Notes:**` (only with an
    actual caveat — omit otherwise, don't pad with filler).
- **Case descriptions:** one line each. Comparisons across cases live in the summary table,
  never restated as prose.
- **Screenshots:** plain `![]()` — renders everywhere.
- **CLI output:** a fenced code block with `title=`.
- **API evidence:** method + full URL (including querystring — copy-pasteable to retry) as
  inline code. Flat query/form params → a table; a JSON request body → its own
  ```` ```json title="Request payload" ```` fence instead (a table doesn't fit nested JSON).
  Response → always a ```` ```json title="Response (<status>)" ```` fence, pretty-printed —
  never one-line stringified JSON, never a raw `curl ...` command.
- **DB evidence:** query as inline code, result rows as a markdown table — not a fenced code
  block.
- **Coverage gaps:** any skipped/blocked/pending/out-of-scope case → a
  `:::warning{title="Not covered"}` callout right after the summary table, one line per case
  with a reason. Omit entirely when every listed case was actually tested.
- **Run stamps:** `_Created: :chip[Run <N>]{<color>} · Last run: :chip[Run <N>]{<color>}_` —
  report level (right after the progress bar) and per case (first line inside each
  `:::details` body). The summary table repeats the same values as `Created`/`Last run`
  columns. **No timestamp here** — run numbers only; the datetime lives solely in the
  `## Run log` table.
  - **Chip color cycles by run number**, one of the 8 below — **never** `success`/`warning`/
    `danger` (those already mean PASS/FAIL/coverage-gap elsewhere in this same report;
    reusing them for a run number would look like a verdict). Key by `N mod 8` (`0` → last
    column):

    | N mod 8 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 0 |
    |---------|---------|------|--------|------|------|------|------|-----|
    | Color   | primary | info | purple | teal | pink | cyan | gray | low |
- **Run log:** a `## Run log` table right after the "Not covered" callout (before the first
  case) — one row per run: `Run <N>` chip, its timestamp, and a one-line description of what
  happened that run. The single place a datetime appears; append-only, see the workflow step
  above.

## Output layout

```
evidence/<topic-slug>/
  report.md
  assets/<case-slug>-01.png
```

In the **project being verified**, not in this skill's own directory — evidence is
project-specific proof. Re-running overwrites `report.md` for that topic — every section
reflects only the current state, except the `## Run log` table, which append-only accumulates
one row per run (see the workflow step above).

## Cross-references

- **Browser evidence** → delegate entirely to the `playwright-cli` skill (`snapshot`,
  `screenshot`, `console`, `requests`). Don't reimplement browser capture here.
- **Markdown syntax** → follow the `blueprint-markdown` skill's grammar exactly; run its
  `validate.mjs` on the finished report.
- **Report prose** → follow the `skimmable-writing` skill when it's available (deliverable-
  first, bold-first bullets, no filler).

## Common mistakes

- Writing plain GFM instead of Blueprint Markdown — screenshots still work as plain
  `![]()`, but callouts/chips/progress bar need the directive syntax.
- Inventing a DB client — always use the project's own existing tool.
- Leaving an empty `**Notes:**` line on a PASS case — omit it, that's filler.
- Putting per-case detail before the summary table — the table is the deliverable, it goes
  first.
- Dumping a raw `curl ...` command instead of showing method/full URL/params/response clearly.
- Pasting a stringified JSON blob instead of pretty-printing it in a `json` fence.
- Putting DB query output in a code block instead of a result table.
- Wrapping cases in `:::accordion` + per-case `:::success`/`:::danger` — use standalone
  `:::details{open}` with the verdict chip in the title so multiple cases stay open at once.
- Silently dropping a case that couldn't be tested instead of flagging it in the "Not
  covered" callout.
- Guessing the timestamp instead of running `date` for a real one.
- Bumping a case's `Last run` when it wasn't actually re-verified this session — only
  genuinely-checked cases get their stamp updated.
- Coloring a `Run <N>` chip `success`/`warning`/`danger` — those are reserved for verdicts and
  coverage gaps; use the 8-color run cycle instead.
- Skipping the `## Summary` heading — without it, the summary section has no TOC entry.
- Putting a timestamp anywhere but the `## Run log` table — every other `Run <N>` stamp is
  chip-only, no date.
- Dropping a prior run's row when appending to `## Run log` — it's append-only, never
  overwritten.
