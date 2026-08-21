:::card{title="Evidence: <topic>"}
::progress{value=<passed> max=<total> color=success label="Cases passed"}
:::

_Created: Run <N> · Last run: Run <N> — <date time>_

| Case | Type | Verdict | Created | Last run |
|------|------|---------|---------|----------|
| <case name> | API | :chip[PASS]{success} | Run <N> | Run <N> — <date time> |
| <case name> | DB | :chip[FAIL]{danger} | Run <N> | Run <N> — <date time> |

:::warning{title="Not covered"}
- <case/scenario> — <reason: blocked by X, out of scope, environment unavailable, …>
:::

:::details{title="Case 1 — <case name>  :chip[PASS]{success}" toc=h2 open}
_Created: Run <N> · Last run: Run <N> — <date time>_

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
_Created: Run <N> · Last run: Run <N> — <date time>_

**What was checked:** <one line>

**Query:** `<SQL or ORM call>`

| <col> | <col> |
|-------|-------|
| <val> | <val> |

**Notes:** <only if there's an actual caveat — omit this line otherwise>
:::
