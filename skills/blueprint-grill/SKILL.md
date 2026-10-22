---
name: blueprint-grill
description: >
  Run the grilling skill (mattpocock-skills:grilling) with the questions in a blueprint-markdown
  doc instead of chat: the user answers in the preview (pick options, accept recommended, type
  notes), clicks Copy answers, pastes them back. Use when the user says "grill me" / "stress-test
  this" AND wants it in blueprint / the preview / a doc, or a blueprint viewer is clearly in use.
  Does not replace grilling — it only changes the channel.
---

# Blueprint grill

**Invoke `mattpocock-skills:grilling` first and follow it unchanged** — design tree, frontier
rounds, a recommended answer per question, sub-agents for facts, done when the frontier is
empty, don't act until the user confirms. This skill only swaps *where* a round is asked.
Never edit the grilling skill. Load `blueprint-markdown` for syntax.

## Per round

1. Write the round to one doc per grill (default `docs/grill-<topic>.md`, or the plan dir),
   in the grilling format mapped to components:

   ````
   ## Round 1

   :::question{id="r1-q1" title="Storage backend"}
   Which store should hold sessions? (word it so "yes" accepts the recommendation)
   :::option{title="SQLite" rec}
   One file, zero setup. Code / image / mermaid allowed here.
   :::
   :::option{title="Postgres"}
   Needs a server.
   :::
   :::

   :::question{id="r1-q2" title="Retention" rec="30 days"}
   Keep sessions how long?
   :::

   :::qa-copy
   :::
   ````

   - Every question in the frontier goes in the same round; one `:::qa-copy` at the end.
   - `rec` on an option / `rec="text"` on a text-only question = your recommended answer (shown as a "Rec" marker).
   - Use `:::option` when choices deserve rich content (code, diagram, image, table); plain
     text questions need no options. `multi` flag = pick several.
   - Ids are `r<round>-q<n>`, **never reused** — answers persist per id in the user's browser.
2. Run `node skills/blueprint-markdown/validate.mjs <file>`; fix before telling the user.
3. Chat message, nothing else: file path + "answer in the preview, **Copy answers**, paste here".
4. Wait. The pasted text is one line block per question, `<id> <title>: <answer>`:
   `✅ accept recommended (…)` = yes; `(unanswered)` = ask again or decide it's non-blocking
   and say so; `notes:` lines are extra remarks.
5. Next round: append `## Round N` to the **same file** (keep earlier rounds as the record),
   fresh ids. Facts you can look up are your job — never put them in a question.

## Notes

- Answers live only in the preview's localStorage; the .md is never modified by answering.
  Exported HTML works the same (keyed by file path).
- When the frontier is empty, summarize the settled decisions in chat and wait for the user's
  confirmation, per grilling.
