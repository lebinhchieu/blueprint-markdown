---
name: evidence
description: Use when asked to "generate evidence", "prove this works", "capture evidence for these cases", or to produce a durable proof report (screenshots, API/DB/command output) that cases were verified, for a reviewer, BA or future reference. Also mid-task, right after implementing, when asked to document what was checked.
---

# Evidence

Turn verification cases into one Blueprint Markdown report with the raw proof embedded per
case, so a reviewer sees what was checked without re-running it. Cases come from chat, a
checklist/plan file, or (mid-task) what you just built and tested.

Not for a quick one-off check with no need for a lasting record: check it and say so in chat.

## Workflow

1. **Route each case by type** and gather evidence:

   | Type | How to verify | Evidence captured |
   |------|----------------|--------------------|
   | UI | `playwright-cli` skill (`snapshot`/`screenshot`); don't reimplement browser capture | screenshot file |
   | API | Run the request | method + full URL incl. querystring (copy-pasteable), params table or JSON request fence, pretty JSON response; never raw curl |
   | DB | The project's own query tool (psql/prisma/ORM script): discover it, don't assume one | query + result rows as a table |
   | CLI/build | Run the command | exit code + stdout/stderr |
   | File/artifact | Read the file | excerpt or diff |
   | Other | Whatever's given | free-text description + raw output |

2. **Verdict** PASS or FAIL per case, from the evidence. Also **test coverage**: grep the
   project's existing test suite for a test covering the case. **Full** = asserts exactly this;
   **Partial** = related, misses part (edge case, branch); **None**. Record the real test
   name/path for Full/Partial; never assume a test exists because the feature does.
3. **Write the report** from `assets/report-template.md` (format below). Prose follows the
   `skimmable-writing` skill if it's available: one idea per sentence, bold the load-bearing
   phrase first, bullets/tables over paragraphs.
4. **Stamp run metadata.** No prior `report.md` → every stamp is `:chip[Run 1]{primary}` and the
   Run log has one row. Otherwise read `references/reruns.md` first.
5. **Validate**: run `validate.mjs` from the `blueprint-markdown` skill's directory on the report.

## Report format

Structure is fixed whatever the session's output style: the report outlives the session.
Syntax: `blueprint-markdown` skill. The template holds the layout; these are the rules it
can't show:

- `## Summary` leads (progress bar, then table); omit it and the section has no TOC entry.
- Per case: standalone `:::details{toc=h2 open}`, **no `:::accordion`** (cases stay open side
  by side). Verdict is `:chip[PASS]{success}`/`:chip[FAIL]{danger}` in the `title=`, not a callout.
  Body: `**What was checked:**` (one line) → evidence → `**Notes:**` only if there's a real caveat.
- Comparisons across cases live in the summary table, not prose.
- Screenshots: plain `![]()`. CLI output: fence with `title=`.
- API: method + full URL as inline code. Flat params → table; JSON body → ```` ```json
  title="Request payload" ````. Response → ```` ```json title="Response (<status>)" ````,
  pretty-printed.
- DB: query as inline code, rows as a markdown table, not a code block.
- Test Coverage column: `:chip[Full]{success}`/`:chip[Partial]{warning}`/`:chip[None]{gray}`
  = an *existing automated test*, not this report's manual check. Full/Partial add the
  test name/path as inline code; None is chip-only.
- Skipped/blocked/out-of-scope case → `:::warning{title="Not covered"}` after the summary
  table, one line per case with a reason; omit when everything was tested. Never silently drop a case.
- Run stamps `_Created: :chip[Run N]{c} · Last run: :chip[Run N]{c}_`: report level, per case
  (first line of each `:::details`), and the summary columns. **No timestamp** outside the
  `## Run log` table, which sits after the "Not covered" callout and before the first case.

## Output

`evidence/<topic-slug>/report.md` and `assets/<case-slug>-01.png`, in the **project being
verified**, not this skill's directory.
