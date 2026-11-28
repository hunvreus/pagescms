---
title: File
description: Pick or upload documents and other files from a media library.
---

Picks or uploads any file, such as a PDF or a ZIP, from a [media library](/docs/configuration/media/) and stores its public path.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: brochure
  type: file
  options:
    media: documents
    extensions: [pdf]
```

A saved value in YAML or Markdown front matter might look like:

```yaml
brochure: /files/brochure.pdf
```

## Options

| Option       | Description                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `media`      | The `name` of the [media library](/docs/configuration/media/) to use, or `false` to disable it. Defaults to the first library. |
| `path`       | Folder to open first, as a repository path inside the library's `input`, such as `public/uploads/brochures`.                   |
| `multiple`   | `true`, or `{ max: 5 }`, to allow several files, stored as a list.                                                             |
| `unique`     | With `multiple`, `true` to prevent picking the same file twice.                                                                |
| `rename`     | Rename uploads: `false`, `safe` (or `true`) or `random`. Overrides the library setting.                                        |
| `categories` | Allowed file types: `image`, `document`, `video`, `audio`, `compressed`, `code`, `font`, `spreadsheet`.                        |
| `extensions` | Allowed extensions, such as `[pdf, zip]`. Overrides `categories`.                                                              |
