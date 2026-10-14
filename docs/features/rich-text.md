# Rich text

Rich-text fields use the reusable editor registry. Configure HTML behavior through
field options; Pages CMS does not implement its own parsing or filtering.

```yaml
- name: body
  type: rich-text
  options:
    format: markdown
    html:
      keep: [div.callout, details, summary, span.badge, figure]
      strip: [.legacy]
      drop: [.discard]
      attributes: [data-kind]
```

`keep` retains supported containers (`div`, `section`, `article`, `aside`,
`header`, `footer`, `details`, `summary`, and definition lists) with editable children. Flow containers
normalize direct text and links into paragraphs. Existing paragraphs are retained;
HTML structure is normalized rather than preserved byte-for-byte. Links retain
standard and configured extra attributes when edited. Other permitted browser
HTML is displayed as an atomic fragment: clicks select it without following links,
and double-clicks open source editing. `strip`
retains plain text only; `drop` removes the entire element. Rules apply recursively
and `drop` wins over `strip`, then `keep`. Classes, IDs, and standard HTML attributes are retained by default on kept
elements; `attributes` permits extra attributes such as `data-kind`. Class
preservation retains all class values, not just the class used in a selector. Scripts, events,
inline styles, unsafe URLs, frames, and form controls cannot be enabled by these rules.

Static SVG icons render by default in both formats, without an SVG option or a
`keep` selector. The shared editor preserves drawing elements and safe SVG
attributes, while removing scripts, events, embedded HTML, animation, links and
external resources. SVG fragments support double-click source editing. This
sanitization also applies when reopening content saved directly in source mode;
it protects the editing interface without requiring stored source to be rewritten.

Selector rules run when content enters the visual editor. Rendering and saving do not apply them again. Prefer class or attribute selectors for stable policies: positional selectors can match different children when filtered content is reopened.

Use `format: html` for HTML output. Markdown output uses normal Markdown for
ordinary content and HTML for retained containers and their children. Formatting
can normalize on visual edits. Merely switching views does not change stored content;
source mode itself does not apply the visual editor's filtering policy.

Markdown comments and capitalized component markup are visible source items.
A container with nested opaque syntax becomes a source item as a whole; nested
selectors do not filter its interior, although root strip/drop rules apply.
Unsafe source exports as code. This is not general MDX support: complex expressions
(such as object-valued props) are not reliably preserved and must stay in source mode.
Shortcodes, MDX expressions, embed presets,
custom extension registration, and custom CSS are not included yet.

The CMS adapter preserves permanent media URLs and save state independently of
the editor's HTML policy. Save/reopen browser tests cover existing and newly added blocks, new collection entries and subsequent edits, and HTML fields. Server tests also round-trip all core field types in nested objects, object lists, blocks, and custom block keys across JSON, YAML, TOML, and frontmatter formats, with content merging enabled and disabled. JSON and YAML root lists are covered too.

## Snippets

Rich-text fields accept `options.snippets`. Each snippet has a `label` and a
`source` string. Use YAML `|` to preserve source line breaks:

```yaml
options:
  html:
    keep: [div.alert, div.alert section]
  snippets:
    - label: Alert
      source: |
        <div class="alert">
          <h2>Heads up!</h2>
          <section>Your message.</section>
        </div>
```

Type `/` and search by label to insert a snippet. Source is parsed using the
field format unless the snippet sets `format: html` or `format: markdown`; this
only controls insertion, while `options.format` controls saved output. The
editor applies the same HTML policy and sanitization as ordinary input. Snippet
HTML is not escaped into literal text, and wrappers require matching keep rules.
Insertion replaces the slash query and supports undo. Snippets are not offered
inside table cells. The shared editor owns insertion and filtering; Pages CMS
validates configuration, forwards it, and handles storage and media separately.

Use `html.keep: [dl]` to enable editable definition lists. Terms (`dt`) and descriptions (`dd`) are retained automatically inside the kept list; descriptions support paragraphs and nested lists. Direct description text normalizes into paragraphs. The shared editor typography already styles definition lists.

Images remain standalone blocks. Select an image and use Link to add, change, or remove its destination; alt-text editing and uploads retain the destination. Linked images reload from both HTML and Markdown without navigation when clicked in the editor. Plain links serialize as `[![alt](image)](destination)` in Markdown, with HTML retained when configured wrapper attributes cannot be represented. Unsafe destination protocols are rejected.
