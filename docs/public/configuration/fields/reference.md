---
title: Reference
description: Link an entry to entries in another collection, such as a post to its author.
---

Picks one or more entries from another collection, such as a post's author or a product's categories.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: author
  type: reference
  options:
    collection: authors
```

A saved value in YAML or Markdown front matter might look like:

```yaml
author: content/authors/sam-lee.md
```

By default the entry's path is stored. Use `value` and `label` to store and display something else:

```yaml
- name: authors
  type: reference
  options:
    collection: authors
    multiple: true
    value: '{name}'
    label: '{name} ({fields.role})'
    search: name,role
```

A saved value in YAML or Markdown front matter might look like:

```yaml
authors: [Sam Lee, Ana Silva]
```

## Options

| Option       | Description                                                             |
| ------------ | ----------------------------------------------------------------------- |
| `collection` | **Required.** The `name` of the collection to pick from.                |
| `value`      | Template for the stored value. Default `{path}`.                        |
| `label`      | Template for what editors see. Default `{name}`.                        |
| `search`     | Comma-separated fields to search, such as `name,email`. Default `name`. |
| `multiple`   | `true` to allow several entries, stored as a list.                      |
| `min`, `max` | With `multiple`, the minimum and maximum number of entries.             |

## Template tokens

| Token              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `{path}`           | The entry's file path                                                        |
| `{name}`           | The entry's name                                                             |
| `{primary}`        | The entry's [primary field](/docs/configuration/content/view/)               |
| `{fields.<field>}` | Any field, including nested ones such as `{fields.company.name}`             |
| `{<field>}`        | Shorthand for `{fields.<field>}` when no token above matches                 |
| `{locale}`         | The language, for [localized](/docs/configuration/localization/) collections |

Changing `value` later doesn't update entries that already store the old format.
