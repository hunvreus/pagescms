---
title: Components
description: Define a field once and reuse it across collections, files and blocks.
---

Components are reusable field definitions. Define one under `components`, then reference it from any field with `component` instead of `type`.

```yaml
components:
  seo:
    type: object
    label: SEO
    fields:
      - name: title
        type: string
      - name: description
        type: text
      - name: image
        type: image

content:
  - name: pages
    type: collection
    path: content/pages
    fields:
      - name: title
        type: string
      - name: seo
        component: seo
  - name: posts
    type: collection
    path: content/posts
    fields:
      - name: title
        type: string
      - name: seo
        component: seo
        label: Search engines
```

A component is a field definition without `name`. The field that uses it supplies the `name` and can override any other key: above, the second `seo` field shows "Search engines" instead of "SEO".

Components are especially useful as [blocks](/docs/configuration/fields/block/):

```yaml
- name: sections
  type: block
  list: true
  blocks:
    - name: hero
      component: hero
    - name: features
      component: features
```

Component names use letters, numbers, `-` and `_`.
