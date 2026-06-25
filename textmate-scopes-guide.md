# TextMate Scopes & VS Code Syntax Highlighting

:::callout{type=info title="How it works"}
A TextMate grammar assigns **scope names** to text ranges. The active color theme maps scope names to colors. Your grammar never defines colors — it only labels tokens. The theme decides what each label looks like.
:::

---

## Scope Name Conventions

Scopes are dot-separated paths. A theme that colors `string` automatically colors `string.quoted.double` too (unless it defines the more specific one separately). **Longer = more specific = higher priority.**

:::tabs
:::tab{title="Keywords & Operators"}

| Scope | Typical color | Use for |
|---|---|---|
| `keyword` | purple / pink | language keywords |
| `keyword.control` | purple | `if` `for` `return` |
| `keyword.operator` | accent / white | `=` `+` `->` `:` |
| `keyword.other` | purple | other reserved words |
| `storage` | purple | `var` `function` `class` |
| `storage.type` | purple | type declaration keywords |
| `storage.modifier` | purple | `public` `static` `readonly` |

:::
:::tab{title="Strings & Values"}

| Scope | Typical color | Use for |
|---|---|---|
| `string` | green / orange | any string literal |
| `string.quoted.double` | green | `"..."` |
| `string.quoted.single` | green | `'...'` |
| `string.quoted.backtick` | green | `` `...` `` |
| `string.unquoted` | green | bare string content |
| `constant` | orange | literals |
| `constant.numeric` | orange | `42` `3.14` |
| `constant.language` | orange | `true` `false` `null` |
| `constant.character.escape` | orange | `\n` `\\` |

:::
:::tab{title="Entities & Names"}

| Scope | Typical color | Use for |
|---|---|---|
| `entity.name` | blue / teal | named identifiers |
| `entity.name.tag` | red / blue | HTML/XML tag names |
| `entity.name.function` | blue | function/method names |
| `entity.name.type` | yellow / teal | class / type names |
| `entity.name.namespace` | teal | module / package names |
| `entity.other.attribute-name` | yellow / orange | HTML attribute keys |
| `entity.other.inherited-class` | teal | superclass names |

:::
:::tab{title="Variables & Support"}

| Scope | Typical color | Use for |
|---|---|---|
| `variable` | white / normal | variable references |
| `variable.other` | white | general identifiers |
| `variable.parameter` | orange | function parameters |
| `variable.language` | blue | `this` `self` `super` |
| `support` | teal | built-in library items |
| `support.function` | teal | built-in functions |
| `support.type` | teal | built-in types |
| `support.class` | teal | built-in classes |
| `support.constant` | teal | built-in constants |

:::
:::tab{title="Punctuation & Meta"}

| Scope | Typical color | Use for |
|---|---|---|
| `punctuation` | dim / muted | all structural chars |
| `punctuation.definition` | dim | opening/closing markers |
| `punctuation.separator` | dim | `,` `.` `;` |
| `punctuation.section` | dim | `{` `}` `[` `]` `(` `)` |
| `punctuation.accessor` | dim | `.` `->` `::` |
| `meta` | *(no color — grouping only)* | contextual regions |
| `comment` | gray / muted | any comment |
| `comment.line` | gray | `//` `#` comments |
| `comment.block` | gray | `/* */` comments |

:::
:::tab{title="Invalid & Markup"}

| Scope | Typical color | Use for |
|---|---|---|
| `invalid` | red / red background | errors |
| `invalid.illegal` | red + underline | definitely wrong tokens |
| `invalid.deprecated` | muted | deprecated usage |
| `markup.heading` | bold | `# Heading` |
| `markup.bold` | bold | `**bold**` |
| `markup.italic` | italic | `*italic*` |
| `markup.raw` | monospace | inline code |
| `markup.underline.link` | blue + underline | URLs |
| `markup.inserted` | green | diff `+` lines |
| `markup.deleted` | red | diff `-` lines |

:::
:::

---

## What This Extension Uses

:::cards{cols=3}
:::card{title="Markers  :::  ::  :" icon=tag}
`punctuation.definition.directive.blueprint`

Inherits from `punctuation` → dim/muted in most themes.
:::
:::card{title="Known directive name" icon=check_circle}
`entity.name.tag.directive.blueprint`

Inherits from `entity.name.tag` → typically red or blue accent.
:::
:::card{title="Unknown / typo'd name" icon=error}
`invalid.illegal.unknown-directive.blueprint`

Inherits from `invalid.illegal` → always red in every theme.
:::
:::card{title="Attribute key  key=" icon=label}
`entity.other.attribute-name.blueprint`

Inherits from `entity.other.attribute-name` → yellow/orange.
:::
:::card{title="String value  \"...\"" icon=format_quote}
`string.quoted.double.blueprint`

Inherits from `string` → green/orange.
:::
:::card{title="Bare word  {red}  {open}" icon=short_text}
`variable.other.directive-attr.blueprint`

Inherits from `variable` → white/normal text.
:::
:::card{title="Inline text  [Active]" icon=text_fields}
`string.unquoted.directive-text.blueprint`

Inherits from `string` → green/orange.
:::
:::card{title="#id  .class" icon=css}
`entity.other.attribute-name.id.blueprint`
`entity.other.attribute-name.class.blueprint`

Inherits from `entity.other.attribute-name`.
:::
:::card{title="= operator" icon=code}
`keyword.operator.assignment.blueprint`

Inherits from `keyword.operator` → accent color.
:::
:::

---

## Debug Workflow

:::steps
:::step{title="Launch the Extension Development Host"}
Press **F5** in VS Code with this project open. A new window opens with the extension loaded from source.

Open any `.md` file in that window with test directives:

```md
:::card{title="Hi" .big #x}
body
:::

::progress{value=70 max=100 label="Build"}

Inline :chip[Active]{success} and :icon[home]{fill}.

:::wrongname{title="typo"}
:::
```
:::

:::step{title="Inspect the token scopes"}
In the host window, open the Command Palette (`Ctrl+Shift+P`) and run:

:::callout{type=tip}
**Developer: Inspect Editor Tokens and Scopes**
:::

Place the cursor on different tokens:
- on `:::` → see `punctuation.definition.directive.blueprint`
- on `card` → see `entity.name.tag.directive.blueprint`
- on `wrongname` → see `invalid.illegal.unknown-directive.blueprint`
- on `"Hi"` → see `string.quoted.double.blueprint`

The panel shows the **full scope stack**, which **theme rule matched**, and the **final color**.
:::

:::step{title="Experiment with colors in user settings"}
Open your **user** `settings.json` (not the project one) and add:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    {
      "scope": "entity.name.tag.directive.blueprint",
      "settings": { "foreground": "#c05a28", "fontStyle": "bold" }
    },
    {
      "scope": "invalid.illegal.unknown-directive.blueprint",
      "settings": { "foreground": "#b83030", "fontStyle": "underline" }
    }
  ]
}
```

Color changes apply **instantly** — no reload needed. Try different hex values here before committing them to the extension.
:::

:::step{title="Reload after grammar changes"}
When you edit `syntaxes/blueprint.injection.tmLanguage.json` directly:

1. Save the file
2. In the **host window** run `Developer: Reload Window`

The grammar is re-read on reload. Scopes update immediately.

:::callout{type=warning}
If you change `esbuild.mjs` (the grammar generator), you must run `npm run build` first to regenerate the JSON, then reload the host window.
:::
:::

:::step{title="Ship colors with the extension (optional)"}
Once happy with your colors, move the rules from user settings into `package.json`:

```json
"contributes": {
  "configurationDefaults": {
    "editor.tokenColorCustomizations": {
      "textMateRules": [
        {
          "scope": "entity.name.tag.directive.blueprint",
          "settings": { "foreground": "#c05a28" }
        }
      ]
    }
  }
}
```

:::callout{type=warning title="Trade-off"}
`configurationDefaults` overrides the user's active theme for those scopes globally. Only do this if theme-agnostic colors are more important than theme harmony. For `invalid.illegal` it's almost always worth it — red is red everywhere.
:::
:::
:::

---

## Quick Reference — Scope Inheritance

```
string                        ← theme always defines this
└── string.quoted             ← more specific (wins if defined)
    └── string.quoted.double  ← most specific (wins if defined)
        └── string.quoted.double.blueprint  ← your extension suffix
```

:::callout{type=tip title="Naming tip"}
The `.blueprint` suffix on all your scopes prevents collisions with other extensions. A theme that doesn't know about `.blueprint` scopes will still color them correctly by inheriting from the conventional parent (`string`, `entity.name.tag`, etc.).
:::
