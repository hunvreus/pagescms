---
title: Select
description: A dropdown of fixed choices, with optional multiple selection.
---

A dropdown of fixed choices. To choose from entries in another collection, use [reference](/docs/configuration/fields/reference/).

Add this field under `fields` in `.pages.yml`:

```yaml
- name: status
  type: select
  options:
    values: [draft, review, published]
```

A saved value in YAML or Markdown front matter might look like:

```yaml
status: draft
```

Use objects when the stored value differs from the label:

```yaml
- name: categories
  type: select
  options:
    multiple: true
    values:
      - { value: art, label: Art }
      - { value: music, label: Music }
```

A saved value in YAML or Markdown front matter might look like:

```yaml
categories: [art, music]
```

## Options

| Option        | Description                                                             |
| ------------- | ----------------------------------------------------------------------- |
| `values`      | **Required.** The choices: plain values, or `{ value, label }` objects. |
| `multiple`    | `true` to allow several choices, stored as a list.                      |
| `min`, `max`  | With `multiple`, the minimum and maximum number of choices.             |
| `placeholder` | Text shown when nothing is selected.                                    |
