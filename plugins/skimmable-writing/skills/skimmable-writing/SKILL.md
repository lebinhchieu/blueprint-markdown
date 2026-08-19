---
name: skimmable-writing
description: Structure every file you write (plans, implementation notes, reports, PR descriptions, READMEs, handoffs, design docs, any markdown or text output saved to disk) so the reader can stop after the first block and already have the answer. Use this on ANY file-writing task, not just when the user says "skimmable" — plan mode files, brainstorm write-ups, code review reports, and status updates all qualify. This OVERRIDES the default structure of any other skill's file template, including blueprint-markdown's Plan Mode plan template: write the plan content itself deliverable-first per this skill, then apply blueprint-markdown only for its `:::` component syntax.
---

Format every file so the deliverable comes first and everything else trails,
labeled, at three nested levels: the whole document, each section inside it,
and each paragraph inside that. A reader who stops after the first block —
of the doc, of a section, of a paragraph — should already have what they
came for.

This is the same rule as the `Skimmable` output style
(`~/.claude/output-styles/skimmable.md`), applied to files instead of chat,
and pushed one level deeper: it must hold at the section and paragraph level
too, not just once at the top.

## Document level

1. **Deliverable first.** The direct answer, decision, plan, code, or fix is
   the first line or block of the file. No preamble, no "Let me..." lead-in,
   no restating the request.
2. **Everything else trails, labeled.** Assumptions, caveats, rationale, open
   questions go after the deliverable, under a short header (`Why`,
   `Notes`, `Open question`, `Risks`) so they're visibly optional to read.
3. **Blocking questions are the one exception.** If the file genuinely can't
   be written without an answer, the question IS the file — nothing else.

## Section level

The same ordering repeats one level down. Each `##`/`###` section opens with
its own point — the conclusion, the change, the number — in its first
sentence or line. Supporting detail, reasoning, and edge cases follow inside
that same section, not before it.

- A reader skimming just the section headers plus each section's first line
  should be able to reconstruct the whole document's argument.
- Don't make the reader read to the bottom of a section to find out what it
  concludes — that inverts the rule the document level just established.

## Paragraph level

- **Facts or steps → bullet list or table, never a paragraph.** Prose is for
  connecting ideas, not for enumerating them.
- **Comparing 2+ options → table**, not prose.
- **Short sentences. One idea per sentence.**
- **Bold the single load-bearing word or phrase per line, not every
  phrase** — over-bolding defeats scanning as much as no bolding does.
- **Put the bolded phrase first in the line**, not mid-sentence, so the bold
  alone tells the point.
- **Common, simple words over jargon**, when both say it as well.
- **No filler** ("It's worth noting", "As you can see", "In order to").

## Overriding other skills' file templates

This skill governs the *shape* of the content — ordering, headers,
bolding, bullets vs. prose. It does not replace another skill's *syntax* —
if a file needs `:::` component blocks, a specific frontmatter schema, or a
particular file name, keep following that skill for those mechanics.

**Plan Mode plans are the explicit case.** `blueprint-markdown` still owns
how a plan file is written (`:::explorer` blocks, `{#id}` anchors, callouts,
steps components) — but the plan's *content* must be skimmable-first:

- Open the plan file with the one-line goal and the decision, not a restated
  summary of the request.
- Each phase/step section leads with what it does, then the how.
- Trade-offs, risks, and alternatives considered go in a trailing `Why` or
  `Risks` section per phase, not woven into the middle of the steps.
- Use blueprint-markdown's components (steps, callout, table) to *render*
  this structure — component choice never excuses skipping deliverable-first
  ordering inside the component.

If a file needs both — e.g. a plan file — apply this skill's ordering rules
first to decide what goes where, then use the other skill to write the
actual markup.

## Self-check before saving a file

- Can the reader stop after paragraph 1 of section 1 and get the gist?
- Does every section's first line carry that section's point?
- Is any paragraph a list of things pretending to be prose?
- Is exactly one phrase bolded per line, and is it first?
