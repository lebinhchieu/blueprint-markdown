:::card{title="Evidence: <topic>"}
::progress{value=<passed> max=<total> color=success label="Cases passed"}
:::

## Summary

_Created: :chip[Run <N>]{<color>} · Last run: :chip[Run <N>]{<color>}_

| Case | Type | Verdict | Created | Last run |
|------|------|---------|---------|----------|
| <case name> | API | :chip[PASS]{success} | :chip[Run <N>]{<color>} | :chip[Run <N>]{<color>} |
| <case name> | DB | :chip[FAIL]{danger} | :chip[Run <N>]{<color>} | :chip[Run <N>]{<color>} |

:::warning{title="Not covered"}
- <case/scenario> — <reason: blocked by X, out of scope, environment unavailable, …>
:::

## Run log

| Run | Date time | Description |
|-----|-----------|--------------|
| :chip[Run <N>]{<color>} | <date time> | <one line: what happened this run — e.g. "Initial run — created 2 cases" or "Re-verified Case 1 after fix"> |

:::details{title="Case 1 — <case name>  :chip[PASS]{success}" toc=h2 open}
_Created: :chip[Run <N>]{<color>} · Last run: :chip[Run <N>]{<color>}_

**What was checked:** <one line>

**Request:** `<METHOD> <full URL, including querystring>`

| Param | Value |
|-------|-------|
| <name> | <value> |

<!-- if the body is JSON instead of flat params, replace the table above with a json-fenced `title="Request payload"` block instead -->

```json title="Response (<status>)"
<pretty-printed JSON>
```
:::

:::details{title="Case 2 — <case name>  :chip[FAIL]{danger}" toc=h2 open}
_Created: :chip[Run <N>]{<color>} · Last run: :chip[Run <N>]{<color>}_

**What was checked:** <one line>

**Query:** `<SQL or ORM call>`

| <col> | <col> |
|-------|-------|
| <val> | <val> |

**Notes:** <only if there's an actual caveat — omit this line otherwise>
:::
