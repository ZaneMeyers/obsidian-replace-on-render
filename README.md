# Replace on Render

Render-time text replacement rules
for Live Preview and Reading Views.
Get the aesthetics of full-Unicode typography
with pure, unambiguous ASCII source code.

This plugin is not a linter,
it does not modify the content of your notes.

**Replace on Render** was inspired by similar implementations
in [Asciidoc](https://docs.asciidoctor.org/asciidoc/latest/subs/replacements/)
and [djot](https://htmlpreview.github.io/?https://github.com/jgm/djot/blob/master/doc/syntax.html#smart-punctuation).

## Rules

Each rule is a JavaScript regular expression plus a replacement:

| Pattern | Replacement | Default classes |
| ------- | ----------- | --------------- |
| `---`   | — (em dash) | `ror-em-dash`   |
| `--`    | – (en dash) | `ror-en-dash`   |

- Rules can be added, edited, reordered,
  disabled, and deleted in the settings.
- The replacement supports `$1`…`$99`,
  `$<name>`, `$&`, `` $` ``, `$'` and `$$`.
- Matching scans left to right.
  If several rules match at the same position,
  the one higher in the list wins,
  so `---` must come before `--`.
- Matches can not cross line breaks or formatting boundaries.
- Patterns that are invalid or match an empty string
  are ignored and marked in the settings.

## Substitutions

By default substitutions are enabled
in Reading View and Live Preview.
Toggles are provided for each of these.

In Live Preview substitutions expand to their source when selected.

Source mode always shows the original text.
(Matches are still `<span>` wrapped per [[#Styling]].)

Always skipped:
inline code, code blocks, math, frontmatter, tags, HTML tags,
URLs and link targets, horizontal rules, table delimiter rows,
and Markdown syntax characters.
Visible link text (including wikilink aliases)
**is** substituted.

**Skip comments** (off by default)
leaves text in `%% ... %%` and `<!-- ... -->` comments untouched.
Comments aren't rendered in Reading view,
so it only affects the editor.
Comment fences are never touched either way.

## Styling

In all views each match is wrapped in a `<span>`
which gets special `ror-` prefixed classes and attributes
for use in CSS snippets.
Class `ror-match` is applied to all matches in all views.
Class `ror-raw` is applied when the span is showing the source text
(in Source mode and Live Preview when the text is selected)
otherwise `ror-replaced` is applied.
Additionally, any number of additional classes can be specified per-rule.

Each span also gets attribute `data-ror-source`
which holds the source text.

Below are some example CSS statements
demonstrating valid selectors.

```css
/* select by source */
.ror-replaced[data-ror-source="->"] { color: var(--text-accent); }

/* select by custom class (defined in rule) */
.ror-replaced.ror-right-arrow { color: var(--text-accent); }

/* diminish matches when source is visible */
.ror-raw { color: var(--text-faint); }
```

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # type-check + production build
npm run lint
```
