---
name: mermaid-diagrams
description: >
  Diagram design judgment — which mermaid diagram type to use, how to lay it out so it's
  actually readable, and how to label it — for any diagram you draw, anywhere: a
  `:::explorer` block, a plain mermaid fence in a plan file or PR description, a doc, or
  a quick answer in chat before it gets written to a file. Use this whenever asked to
  draw, diagram, visualize, map out, chart, or sketch a flow, architecture, pipeline,
  call sequence, data model, state machine, or process — even if the user never says
  "mermaid" or "diagram" (e.g. "show me how the request flows through these services",
  "visualize this architecture", "map out the call chain", "what does this pipeline look
  like end to end"). Also use this to sanity-check a diagram someone else drew — wrong
  diagram type, unreadable layout, and inconsistent labels are the most common defects.
  This skill owns diagram *design*, not `:::explorer` *syntax* — for that block's exact
  grammar (`{#id}` pairing, pin position, colors-as-classDef), consult blueprint-markdown too;
  the two are meant to be used together whenever the diagram is going into an explorer block.
---

# Mermaid Diagram Best Practices

Read this before drawing any diagram, and before finalizing one someone else drew. The
name of the game is: **pick the type that matches the question, then make it legible.**
A diagram that's technically valid mermaid but the wrong type, or unreadable once it
renders, hasn't actually helped anyone — it's just prose with extra syntax.

If you're about to write a `:::explorer` block, also load the **blueprint-markdown**
skill for the exact directive grammar (it owns `{#id}` pairing, `{pin=left|top}`,
`{width}`) and check CLAUDE.md §7 for what an explorer block's content must carry
(one detail section per node, a "Simplified" note on any flattened node, a closing
"Not shown" list, colors/groups). This skill is what decides the diagram *underneath*
that wrapper.

**Pairing is by node id, not by number.** Each detail heading ends with a `{#id}` anchor
naming the node's own mermaid id — `auth["Auth Service"]` pairs with
`### Auth Service {#auth}`, and `subgraph boot["Startup"]` with `### Startup {#boot}`.
There is no number-based fallback: a heading without an anchor leaves its box dead, with
no error. This is why §3's "short, stable node IDs" rule matters more here than anywhere
else — in an explorer block the id *is* the link.

Only `flowchart`/`graph`, `stateDiagram-v2` and `classDiagram` link at all. Every other
type pins and renders normally but is never clickable, so pick one of the three when
click-through matters — that's a design decision this skill owns, not a syntax detail.

## 0. Should this even be a diagram?

- A single linear flow with no branches → numbered list, not a diagram.
- A matrix of options/attributes → table, not a graph.
- A 2-node relationship → one sentence.
- Otherwise (3+ connected parts), it's worth a real diagram.

## 1. Pick the right diagram type

| Need | Type |
|---|---|
| Steps, control flow, decision branches | `flowchart` |
| Who calls whom, over time | `sequenceDiagram` |
| Data model, entities & relationships | `erDiagram` |
| Object structure, inheritance | `classDiagram` |
| Lifecycle, modes | `stateDiagram-v2` |
| Schedule with durations/dependencies | `gantt` |
| Dated events, no duration | `timeline` |
| Hierarchical brainstorm, no directional flow | `mindmap` |

- Don't force a flowchart to show timing/ordering between actors — use `sequenceDiagram`.
- Don't use `classDiagram` for a one-off data flow — that's a `flowchart`.
- Cross-service *topology* (who owns what, static structure) is still a flowchart even
  when services call each other — reach for `sequenceDiagram` only when the *order and
  timing of calls* is the point, not just that calls happen.
- Always write `flowchart`, never the legacy `graph` alias — same renderer either way,
  but mixing them across files/diagrams is how inconsistency creeps in.

## 2. Layout & readability

- Pick one direction and keep it: `TD` for hierarchies/flows, `LR` for pipelines or
  sequences with many stages. Don't mix per diagram.
- Group related nodes in `subgraph` blocks — cuts visual noise more than any node styling.
- Cap it around 15-20 nodes for a plain diagram; for `:::explorer` blocks keep it lower
  (~10-12) since each node also carries a full detail section (CLAUDE.md §7). Watch edge
  density too — a 14-node diagram with 40 edges is a hairball the node cap alone won't
  catch. Watch fan-in as well: a node with 8+ incoming edges (logger, error handler)
  needs its own subgraph or a "see detail" callout, not more arrows into one box.
- When you do split into a top-level + detail diagrams: cut at a subsystem boundary
  (not an arbitrary node count), give each detail diagram a title matching the parent
  node it expands, and list what the split hides in the parent's "Not shown".
- Order nodes so related ones are adjacent, to minimize edge crossings. Route a shared
  edge through a middle node rather than crossing three lanes.
- Don't let a node have more than ~5-6 outgoing edges — it's probably doing too much,
  or needs a subgraph.
- For `:::explorer` blocks, a long horizontal (`LR`) diagram should use `{pin=top}`
  instead of the default `{pin=left}` — pinning left leaves less horizontal room for an
  already-wide diagram, squeezing it further. Keep `{pin=left}` for tall/narrow (`TD`)
  diagrams, where it doesn't compete for width.
- Color: always set `color:` explicitly in `classDef` (renderer text defaults break
  under dark themes). Pick fills that stay distinct under deuteranopia — vary lightness,
  not just hue (green-vs-orange or pink-vs-red as your only two groups will collide).
  Color confirms grouping, it isn't the only signal — a node's color class must match
  the subgraph it's actually drawn in. Use `classDef` when 2+ nodes share a category,
  `style` only for a true one-off (e.g. highlighting a single terminal node).
- `sequenceDiagram`, `erDiagram`, and other non-flowchart types don't take the
  direction/subgraph/node-cap rules above — see §2a.

## 2a. Type-specific notes

**sequenceDiagram**
- Declare every `participant` up front, in the order you want them to render left-to-
  right — otherwise order is decided by first mention and reshuffles as you add calls.
- Solid arrow with filled head (`->>`) = a call; dashed (`-->>`) = a return. Don't use
  solid for both directions.
- Use `alt`/`opt`/`loop` blocks for branching or repetition instead of drawing separate
  near-duplicate flows for each case.
- Cap participants around 5-7 — past that, split by sub-flow rather than cramming every
  actor into one diagram.
- Note for `:::explorer`: a `sequenceDiagram` **never links**. Mermaid drops the
  participant id before render (actors come out as `actor0`, `actor1`), so there is
  nothing for `{#id}` to match. It still pins and reads fine — just don't promise
  clickable boxes, and say so if the reader might expect them.

**erDiagram**
- Cardinality reads left-to-right on the relationship line (`||--o{` = "exactly one to
  zero-or-many") — double-check which side you put each symbol on; it's the classic
  transposition mistake.
- Note for `:::explorer`: entities **never link**. Mermaid rejects entity aliases
  (`auth["Auth"]` is a parse error), so an entity's displayed name is its raw id and
  there's no way to give it a readable label — the pairing was deliberately left out.

**classDiagram / stateDiagram-v2**
- Both link in `:::explorer`. Put the readable text in the label and keep the id for
  pairing: `class auth["Auth Service"]` and `auth : Auth Service` respectively, each
  paired with `### Auth Service {#auth}`.

**stateDiagram-v2**
- Always show the `[*]` start (and end, if there is one) — a state diagram without an
  entry point reads as an unordered list of boxes.

## 3. Labeling conventions

- Quote every label, no exceptions — cheaper than tracking which characters are safe.
  Inside quotes, the ones that still break things: `<`/`>` (rendered as HTML — wrap
  generics like `Array<T>` in quotes or they get swallowed), a literal `"` (needs
  `#quot;`, not a backslash), and `\n` (use `<br/>` for a line break, not a raw newline).
  Outside quotes: never name a node `end` (lowercase — it terminates the flowchart
  parser) or start an ID with `o`/`x` (`A---oB` gets parsed as an edge modifier).
- Node labels: short noun phrases (`Auth Service`, not `The service that handles auth`).
  No abbreviations unless defined elsewhere in the doc.
- Edge labels: verb phrases describing the action (`writes to`, `validates`, `emits`),
  not nouns.
- Be consistent: if one edge says "calls," don't have another say "invokes" for the
  same kind of relationship elsewhere in the same diagram.
- Keep node IDs short and stable (`svc_auth`), and put the human-readable text in the
  label (`svc_auth["Auth Service"]`) — makes edges easier to read and IDs easier to reuse.
  In a `:::explorer` block this stops being cosmetic: the id is the pairing key, so
  renaming one silently kills its detail link unless you change the `{#id}` anchor to
  match. Prefer meaningful ids (`svc_auth`, `boot`) over positional ones (`n1`, `a`),
  which are exactly the ones that go stale when the diagram is reordered.

## 4. Before you ship it

Run the diagram through a parser (e.g. `mmdc -i file.mmd -o /dev/null`, or the
blueprint-markdown skill's own validator for `:::explorer` blocks) — a syntax error
renders as a blank or broken box with no error message in most viewers, so nothing else
here matters if the diagram doesn't parse.
