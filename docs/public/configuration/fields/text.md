---
title: Text
description: A multi-line plain text input for summaries, excerpts and notes.
---

A multi-line plain text input, without formatting. For formatted content, use [rich text](/docs/configuration/fields/rich-text/).

Add this field under `fields` in `.pages.yml`:

```yaml
- name: excerpt
  type: text
  options:
    maxlength: 280
```

A saved value in YAML or Markdown front matter might look like:

```yaml
excerpt: A short summary of the post.
```

## Options

| Option      | Description                   |
| ----------- | ----------------------------- |
| `minlength` | Minimum number of characters. |
| `maxlength` | Maximum number of characters. |

Validate the format with [`pattern`](/docs/configuration/fields/#validation).
