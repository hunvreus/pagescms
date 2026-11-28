---
title: Image
description: Pick or upload images from a media library.
---

Picks or uploads an image from a [media library](/docs/configuration/media/) and stores its public path.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: cover
  type: image
```

A saved value in YAML or Markdown front matter might look like:

```yaml
cover: /uploads/cover.jpg
```

For a gallery:

```yaml
- name: gallery
  type: image
  options:
    multiple: { max: 12 }
    unique: true
```

A saved value in YAML or Markdown front matter might look like:

```yaml
gallery: [/uploads/a.jpg, /uploads/b.jpg]
```

Previews in Pages CMS may use temporary URLs; only the public path is saved.

## Options

| Option       | Description                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `media`      | The `name` of the [media library](/docs/configuration/media/) to use, or `false` to disable it. Defaults to the first library. |
| `path`       | Folder to open first, as a repository path inside the library's `input`, such as `public/uploads/covers`.                      |
| `multiple`   | `true`, or `{ max: 5 }`, to allow several files, stored as a list.                                                             |
| `unique`     | With `multiple`, `true` to prevent picking the same file twice.                                                                |
| `rename`     | Rename uploads: `false`, `safe` (or `true`) or `random`. Overrides the library setting.                                        |
| `extensions` | Allowed extensions, such as `[jpg, png, webp]`.                                                                                |
