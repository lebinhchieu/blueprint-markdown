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
     this new run number + the current timestamp.
   - Per case, match by exact case-description text against the previous report:
     - Matched **and** actually (re-)verified this session → keep `Created`, bump `Last run`
       to the new report run number + current timestamp.
     - Matched but **not** re-verified this session → keep both `Created` and `Last run`
       exactly as they were.
     - No match (new case, or reworded) → both `Created` and `Last run` = the new report run
       number + current timestamp.
   - No prior `report.md` → report and every case start at `Run 1`, timestamped now.

## Report format

Copy `assets/report-template.md` and fill it in. Written in Blueprint Markdown (see that
skill for syntax) — use its `validate.mjs` after writing to catch unclosed directives.

**Structure is fixed, regardless of the invoking session's output style** — the report
outlives this session and needs to read cleanly on its own:
- **Progress bar + summary table lead the file.** The overall verdict is the deliverable —
  a reader should be able to stop there if that's all they need.
- **Per case:** a standalone `:::details{toc=h2 open}` block — no `:::accordion` wrapper,
  cases stay independently open so a reviewer can compare several at once. The verdict is a
  `:chip[PASS]{success}`/`:chip[FAIL]{danger}` in the `title=` itself, not a callout box.
  `toc=h2` renders that title as a real heading (same look) so each case gets an entry in the
  preview's TOC rail. Body: `**What was checked:**` is one bolded-label line, then the
  evidence, then `**Notes:**` — only when there's an actual caveat. Omit the `Notes:` line
  otherwise; don't pad with filler.
- Case descriptions are one line each. Comparisons across cases live in the summary table,
  never restated as prose.
- Screenshots use plain `![]()` (renders everywhere). CLI output goes in a fenced code block
  with `title=`.
- **API evidence:** method + full URL (including querystring — copy-pasteable to retry
  manually) as inline code. Flat query/form params go in a table; a JSON request body gets
  its own ```` ```json title="Request payload" ```` fence instead (a table doesn't fit nested
  JSON). Response is always a ```` ```json title="Response (<status>)" ```` fence,
  pretty-printed — never one-line stringified JSON, never a raw `curl ...` command.
- **DB evidence:** query as inline code, result rows as a markdown table — not a fenced code
  block.
- **Coverage gaps:** if any case was skipped, blocked, pending, or out of scope, add a
  `:::warning{title="Not covered"}` callout right after the summary table listing each with a
  one-line reason. Omit entirely when every listed case was actually tested.
- **Run stamp:** one caption line, `_Created: Run <N> · Last run: Run <N> — <date time>_`,
  right after the progress bar (report level) and as the first line inside each case's
  `:::details` body (per case, tracked independently — see the workflow step above). The
  summary table also gets `Created`/`Last run` columns with the same per-case values, so the
  staleness signal is visible without opening any case.

## Output layout

```
evidence/<topic-slug>/
  report.md
  assets/<case-slug>-01.png
```

In the **project being verified**, not in this skill's own directory — evidence is
project-specific proof. Re-running overwrites `report.md` for that topic; no history/
versioning.

## Cross-references

- **Browser evidence** → delegate entirely to the `playwright-cli` skill (`snapshot`,
  `screenshot`, `console`, `requests`). Don't reimplement browser capture here.
- **Markdown syntax** → follow the `blueprint-markdown` skill's grammar exactly; run its
  `validate.mjs` on the finished report.

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
