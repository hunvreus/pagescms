---
title: Filenames
description: Control how new collection entries are named.
---

When an editor creates an entry, Pages CMS names the file from the collection's `filename` template. The default is:

```yaml
filename: '{year}-{month}-{day}-{primary}.md'
```

A post titled "Hello world" created on 1 March 2026 becomes `2026-03-01-hello-world.md`. With `format: json`, `yaml` or `toml`, the default extension is `.json`, `.yml` or `.toml` instead.

The template is relative to the folder where you select **New entry**. Use `/` in the template to create subfolders. Field values are slugified, so a title such as `News / Updates` contributes the single segment `news-updates`. Changing the template affects future entries.

## Common templates

| Template                              | Result                               |
| ------------------------------------- | ------------------------------------ |
| `'{primary}.md'`                      | `hello-world.md`                     |
| `'{year}-{month}-{day}-{primary}.md'` | `2026-03-01-hello-world.md`          |
| `'{sku}.json'`                        | `abc-123.json`, from the `sku` field |

## Page bundles and date folders

For a Hugo section, set `filename: '{primary}/_index.md'` and `view: {layout: tree, node: _index.md}`. With French selected and filename-suffix localization, creating “About” in `content/pages` writes `content/pages/about/_index.fr.md`. Open the About row in the tree to edit it.

For date folders, use `filename: '{year}/{month}/{primary}.md'`. Creating “Hello” in November 2026 from `content/posts/news` writes `content/posts/news/2026/11/hello.md`, or `hello.fr.md` in the same folder with a French locale suffix.

Use a flat template for collections with `subfolders: false`. Each generated path segment must be non-empty. Absolute paths, backslashes, and `.` or `..` segments are invalid.

## Tokens

| Token                             | Value                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{primary}`                       | The entry's primary field, slugified: [`view.primary`](/docs/configuration/content/view/), otherwise `title`, `name` or `label`, otherwise the first text, number or date field |
| `{slug}`                          | Same as `{primary}`                                                                                                                                                             |
| `{<field>}` or `{fields.<field>}` | Any field's value, slugified                                                                                                                                                    |
| `{year}`, `{month}`, `{day}`      | Creation date, zero-padded                                                                                                                                                      |
| `{hour}`, `{minute}`, `{second}`  | Creation time, zero-padded                                                                                                                                                      |

## Let editors change the filename

Use the object form to show a filename input:

```yaml
filename:
  template: '{primary}.md'
  field: create
```

- `false` (default): hidden.
- `create`: shown only when creating an entry.
- `true`: shown when creating and editing. Editing it renames the file.

An explicitly entered filename is a single filename in the selected folder. The rename field also accepts a single filename.
