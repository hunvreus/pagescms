---
title: UUID
description: A generated unique ID that stays the same when titles or filenames change.
---

A unique ID, generated automatically. Use it when other content needs a stable way to refer to an entry, independent of its title or filename.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: id
  type: uuid
```

A saved value in YAML or Markdown front matter might look like:

```yaml
id: 550e8400-e29b-41d4-a716-446655440000
```

New entries get a UUID v4 automatically. To start empty instead, set `default: ""`. Generating a new ID changes the value; anything referring to the old one won't follow it.

## Options

| Option     | Description                                         |
| ---------- | --------------------------------------------------- |
| `editable` | `true` to let editors type their own value.         |
| `generate` | `false` to hide the button that generates a new ID. |
