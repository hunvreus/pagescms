---
title: Rich text
description: A visual editor for formatted content, saved as Markdown or HTML.
---

A visual editor for formatted content, with a **Source** mode for the raw Markdown or HTML. Both modes edit the same value.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: body
  type: rich-text
```

Content is saved as Markdown by default. As the `body` field of a Markdown file, it's the text below the front matter. As any other field, it's a string:

```yaml
intro: 'Welcome to **our** site.'
```

## Options

| Option       | Description                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `format`     | `markdown` (default) or `html`.                                                                    |
| `switcher`   | `false` to hide the Editor/Source switch.                                                          |
| `media`      | The [media library](/docs/configuration/media/) for inserted images, or `false` to disable images. |
| `path`       | Folder to open first when inserting an image, as a repository path inside the library's `input`.   |
| `extensions` | Allowed image extensions.                                                                          |
| `rename`     | Rename uploads: `false`, `safe` (or `true`) or `random`.                                           |
| `snippets`   | Reusable content editors insert with `/`. See [Snippets](#snippets).                               |
| `html`       | Which HTML elements to keep, unwrap or drop. See [HTML elements](#html-elements).                  |

## Snippets

Snippets give editors pre-built content, such as a callout, to insert by typing `/` and searching for its label:

```yaml
- name: body
  type: rich-text
  options:
    html:
      keep: [div.callout]
    snippets:
      - label: Callout
        source: |
          <div class="callout">
            <p>Your message.</p>
          </div>
```

| Snippet key | Description                                                                              |
| ----------- | ---------------------------------------------------------------------------------------- |
| `label`     | **Required.** Name shown in the `/` menu.                                                |
| `source`    | **Required.** The content to insert. Use a YAML block scalar (`\|`) to keep line breaks. |
| `format`    | `markdown` or `html`, if the source isn't in the field's format.                         |

HTML wrappers in a snippet must also be listed in `html.keep`, or they're removed on insert.

## HTML elements

The visual editor understands standard formatting: headings, lists, links, images, tables and so on. Other HTML, such as a `<div class="callout">`, is shown as a block you edit in source mode. `html` lets you change that per element, using CSS selectors:

```yaml
options:
  html:
    keep: [div.callout, details, summary]
    strip: [span.legacy]
    drop: [.internal-note]
    attributes: [data-kind]
```

| Key          | Effect                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keep`       | Keep the element and make its content editable. Supports `div`, `section`, `article`, `aside`, `header`, `footer`, `details`, `summary` and definition lists (`dl`). |
| `strip`      | Remove the element but keep its text.                                                                                                                                |
| `drop`       | Remove the element and its content.                                                                                                                                  |
| `attributes` | Extra attributes to keep on kept elements, such as `data-kind`. Classes, IDs and standard attributes are kept already.                                               |

`drop` takes precedence over `strip`, and `strip` over `keep`. Rules apply when content is opened in the visual editor; switching to source and back doesn't change stored content. Scripts, event handlers, inline styles, iframes and form controls are always removed and can't be allowed.

With `format: markdown`, ordinary content stays Markdown and kept elements are saved as HTML inside it.

## Good to know

- Markdown comments and component tags such as `<Callout />` are shown as source blocks and preserved. Complex MDX, such as expressions or object props, should be edited in source mode.
- Simple SVG icons display in the editor; scripts and external resources inside them are removed.
