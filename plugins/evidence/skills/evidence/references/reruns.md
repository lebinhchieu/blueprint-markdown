# Re-runs — run numbers, stamps, Run log

Read before stamping when a `report.md` already exists for the topic. Run numbers only on
chips; the datetime lives solely in the `## Run log` table.

- Get the real timestamp with `date`. Never guess one.
- Report level: new run = previous run + 1. `Created` stays what the first report recorded;
  `Last run` = the new run.
- Per case, match the previous report by **exact case-description text**:
  - Matched **and** actually re-verified this session → keep `Created`, bump `Last run`.
  - Matched but **not** re-verified → keep both exactly as they were.
  - No match (new or reworded) → both = the new run.
- Run log: carry every existing row forward unchanged, append exactly one row (run chip,
  timestamp, one line on what happened: cases added, re-verified, why). Never edit or drop an
  old row.
- Re-running overwrites `report.md`; every section shows current state except the Run log.

**Chip color cycles by run number** `N mod 8` (`0` → last column). Never `success`/`warning`/
`danger` — those mean PASS/FAIL/coverage-gap elsewhere in the report and would read as a verdict.

| N mod 8 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 0 |
|---------|---------|------|--------|------|------|------|------|-----|
| Color   | primary | info | purple | teal | pink | cyan | gray | low |
