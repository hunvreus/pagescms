---
title: Code
description: A code editor with syntax highlighting for snippets, templates and embeds.
---

A code editor with syntax highlighting. The value is saved as a string.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: embed
  type: code
  options:
    format: html
```

A saved value in YAML or Markdown front matter might look like:

```yaml
embed: '<iframe src="https://example.com"></iframe>'
```

To edit a whole file as code instead of a single field, see [File formats](/docs/configuration/content/formats/#source-editing).

## Options

| Option   | Description                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format` | Language for highlighting: `html`, `markdown`, `mdx`, `javascript`, `jsx`, `typescript`, `tsx`, `json` or `yaml`. Short forms such as `js`, `ts`, `yml`, `md` and `htm` also work. |
