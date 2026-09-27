---
name: present
description: >
  Triggers: "make a presentation / talk / walkthrough / explainer about X", "turn this
  (doc, PR, code, notes) into a presentation". Writes a NEW blueprint-markdown document
  built to present itself, then generates its Kokoro narration audio. To write it without
  audio, use prepare-present. Not for adding narration to an existing doc as-is — that's
  blueprint-markdown's "Present mode" section.
---

Two steps: write the document, then generate its audio.

1. **Write** — follow the `prepare-present` skill in full (load it): settle inputs, shape,
   narration, and its verify steps 1–2. Skip its "don't run narrate" report.
2. **Narrate** — from the enhanced-markdown-vscode repo: `npm run narrate -- <file>` generates
   the audio (Kokoro, or VieNeu for `vi` — one-time setup at the top of `scripts/narrate.mjs`)
   into `.narration/<doc>/` beside the file. Re-run; it must print `0 to generate`.
3. **Report**: file path, segment count, estimated minutes, and the narrate result. If narrate
   couldn't run, say so — Present mode then falls back to the browser voice.
