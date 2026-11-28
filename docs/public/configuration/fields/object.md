---
title: Object
description: Group related fields into a nested object, such as an address or SEO settings.
---

Groups fields into a nested object.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: author
  type: object
  fields:
    - name: name
      type: string
    - name: email
      type: string
```

A saved value in YAML or Markdown front matter might look like:

```yaml
author:
  name: Sam Lee
  email: sam@example.com
```

With `list: true`, it becomes a list of objects:

```yaml
- name: links
  type: object
  list: true
  fields:
    - name: label
      type: string
    - name: url
      type: string
```

A saved value in YAML or Markdown front matter might look like:

```yaml
links:
  - label: GitHub
    url: https://github.com/acme
```

Long lists can collapse each item behind a summary; see [Lists](/docs/configuration/fields/#lists).

## Keys

| Key      | Description                      |
| -------- | -------------------------------- |
| `fields` | **Required.** The nested fields. |

## Required and read-only

- `required: true` on an object means it can't be empty. It doesn't make its child fields required.
- Child fields' `required` rules apply only once the object has some content, so an optional object can stay empty.
- `readonly: true` makes every nested field read-only.

Reuse an object across content with [components](/docs/configuration/components/).
