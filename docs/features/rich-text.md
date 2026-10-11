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

`keep` retains supported containers with editable children. Other permitted browser
HTML is displayed as an atomic fragment with double-click source editing. `strip`
retains plain text only; `drop` removes the entire element. Rules apply recursively
and `drop` wins over `strip`, then `keep`. Classes, IDs, and standard HTML attributes are retained by default on kept
elements; `attributes` permits extra attributes such as `data-kind`. Class
preservation retains all class values, not just the class used in a selector. Scripts, events,
inline styles, unsafe URLs, frames, and form controls cannot be enabled by these rules.

Selector rules run when content enters the visual editor. Rendering and saving do not apply them again. Prefer class or attribute selectors for stable policies: positional selectors can match different children when filtered content is reopened.

Use `format: html` for HTML output. Markdown output uses normal Markdown for
ordinary content and HTML for retained containers and their children. Formatting
can normalize on visual edits. Merely switching views does not change stored content;
source mode itself does not apply the visual editor's filtering policy.

Markdown comments and capitalized component markup are visible source items.
A container with nested opaque syntax becomes a source item as a whole; nested
selectors do not filter its interior, although root strip/drop rules apply.
Unsafe source exports as code. Shortcodes, MDX expressions, snippets, embed presets,
custom extension registration, and custom CSS are not included yet.

The CMS adapter preserves permanent media URLs and save state independently of
the editor's HTML policy. Save/reopen browser tests cover this boundary.
