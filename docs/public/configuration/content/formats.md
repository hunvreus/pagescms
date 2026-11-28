---
title: File formats
description: How Pages CMS reads and writes Markdown, YAML, JSON, TOML and source files.
---

Pages CMS picks a format from the file extension, so you rarely need to set one. Set `format` on a collection or file only to override the guess.

## Inferred formats

| Extension                            | With `fields`      | Without `fields`                       |
| ------------------------------------ | ------------------ | -------------------------------------- |
| `.json`                              | `json`             | `code`                                 |
| `.yml`, `.yaml`                      | `yaml`             | `code`                                 |
| `.toml`                              | `toml`             | `raw`                                  |
| `.md`, `.mdx`, `.html`, `.js`, `.ts` | `yaml-frontmatter` | `code`                                 |
| `.csv`                               | —                  | `datagrid`, shown in the source editor |
| Anything else                        | `yaml-frontmatter` | `raw`                                  |

## All formats

| `format`               | Reads and writes                              |
| ---------------------- | --------------------------------------------- |
| `yaml-frontmatter`     | Front matter between `---` lines, plus a body |
| `json-frontmatter`     | JSON front matter, plus a body                |
| `toml-frontmatter`     | Front matter between `+++` lines, plus a body |
| `yaml`, `json`, `toml` | A whole data file                             |
| `code`                 | Source editor with syntax highlighting        |
| `raw`                  | Plain text editor                             |
| `datagrid`             | CSV, shown in the source editor               |

## Front matter and the body

In front matter formats, each field maps to a front matter key, except a field named `body`, which maps to everything below the front matter:

```yaml
fields:
  - name: title
    type: string
  - name: body
    type: rich-text
```

For non-standard delimiters, set `delimiters`, for example `delimiters: "+++"` or `delimiters: ["<!--", "-->"]`.

If Pages CMS cannot read a collection file, the file remains in the list but some fields may be missing. The warning identifies affected files; after fixing them, select Refresh to check them again.

## Source editing

Leave out `fields` to edit a file as source: useful for `robots.txt`, redirect rules or snippets.

```yaml
- name: redirects
  label: Redirects
  type: file
  path: public/_redirects
  format: code
```

Files with known code extensions open in the code editor automatically. Set `format: code` for extensionless files such as `_redirects`.

## Keeping unknown keys

By default, saving a structured file writes only the keys your fields describe. If your schema covers only part of a file, set [`settings.content.merge: true`](/docs/configuration/settings/#content-merging) to keep the rest.
