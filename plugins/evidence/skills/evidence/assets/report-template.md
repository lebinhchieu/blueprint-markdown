:::card{title="Evidence: <topic>"}
::progress{value=<passed> max=<total> color=success label="Cases passed"}
:::

| Case | Type | Verdict |
|------|------|---------|
| <case name> | API | :chip[PASS]{success} |
| <case name> | DB | :chip[FAIL]{danger} |

:::warning{title="Not covered"}
- <case/scenario> — <reason: blocked by X, out of scope, environment unavailable, …>
:::

:::details{title="Case 1 — <case name>  :chip[PASS]{success}" open}
**What was checked:** <one line>

**Request:** `<METHOD> <full URL, including querystring>`

| Param | Value |
|-------|-------|
| <name> | <value> |

<!-- if the body is JSON instead of flat params, replace the table above with a
     ```json title="Request payload"``` fence instead -->

```json title="Response (<status>)"
<pretty-printed JSON>
```
:::

:::details{title="Case 2 — <case name>  :chip[FAIL]{danger}" open}
**What was checked:** <one line>

**Query:** `<SQL or ORM call>`

| <col> | <col> |
|-------|-------|
| <val> | <val> |

**Notes:** <only if there's an actual caveat — omit this line otherwise>
:::
