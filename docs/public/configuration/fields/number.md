---
title: Number
description: A numeric input for prices, quantities, weights and ordering.
---

A numeric input.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: price
  type: number
  options:
    min: 0
```

A saved value in YAML or Markdown front matter might look like:

```yaml
price: 12.5
```

## Options

| Option | Description             |
| ------ | ----------------------- |
| `min`  | Smallest allowed value. |
| `max`  | Largest allowed value.  |
