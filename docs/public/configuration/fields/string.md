---
title: String
description: A single-line text input for short values such as titles, names and slugs.
---

A single-line text input.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: title
  type: string
  required: true
  options:
    maxlength: 120
```

A saved value in YAML or Markdown front matter might look like:

```yaml
title: A new story
```

## Options

| Option      | Description                   |
| ----------- | ----------------------------- |
| `minlength` | Minimum number of characters. |
| `maxlength` | Maximum number of characters. |

Validate the format with [`pattern`](/docs/configuration/fields/#validation).
