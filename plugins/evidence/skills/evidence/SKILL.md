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
   | API | Run the request | status + response body |
   | DB | Use whatever query tool the project already has (psql/prisma/ORM script) — discover it, don't assume one | query output |
   | CLI/build | Run the command | exit code + stdout/stderr |
   | File/artifact | Read the file | content excerpt or diff |
   | Other | Whatever's given | free-text description + raw output |

3. **Capture a verdict** — PASS or FAIL — per case, from the evidence gathered.
4. **Write the report** using `assets/report-template.md` as the skeleton, filled with the
   real cases (format below).

## Report format

Copy `assets/report-template.md` and fill it in. Written in Blueprint Markdown (see that
skill for syntax) — use its `validate.mjs` after writing to catch unclosed directives.

**Structure is fixed, regardless of the invoking session's output style** — the report
outlives this session and needs to read cleanly on its own:
- **Progress bar + summary table lead the file.** The overall verdict is the deliverable —
  a reader should be able to stop there if that's all they need.
- **Per case:** the verdict callout (`:::success`/`:::danger`) comes first, `**What was
  checked:**` is one bolded-label line, then the evidence, then `**Notes:**` — only when
  there's an actual caveat. Omit the `Notes:` line otherwise; don't pad with filler.
- Case descriptions are one line each. Comparisons across cases live in the summary table,
  never restated as prose.
- Screenshots use plain `![]()` (renders everywhere); API/DB/CLI output goes in fenced code
  blocks with `title=`.

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
