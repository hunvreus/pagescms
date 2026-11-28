---
title: Block
description: Let editors choose between several field groups, for page builders and flexible sections.
---

A block holds one of several field groups, and the editor chooses which. With `list: true` it becomes a page builder: a list of sections that can each be a different kind.

Add this field under `fields` in `.pages.yml`:

```yaml
- name: sections
  type: block
  list: true
  blocks:
    - name: hero
      label: Hero
      fields:
        - name: heading
          type: string
        - name: image
          type: image
    - name: text
      label: Text
      fields:
        - name: body
          type: rich-text
```

Each item stores its fields plus the block's name under `_block`:

```yaml
sections:
  - _block: hero
    heading: Welcome
    image: /uploads/hero.jpg
  - _block: text
    body: Hello world
```

If your site expects a different key, such as `type`, set `blockKey`:

```yaml
- name: sections
  type: block
  list: true
  blockKey: type
  blocks: …
```

## Keys

`blocks` and `blockKey` go directly on the field, not under `options`.

| Key        | Description                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `blocks`   | **Required.** The available blocks. Each has a `name`, an optional `label`, and either `fields` or a `component`. |
| `blockKey` | The key that stores the block's name. Default `_block`.                                                           |

## Tips

- Define blocks as [components](/docs/configuration/components/) to share them between collections: `- { name: hero, component: hero }`.
- A block's own fields can be lists or objects, such as a list of FAQ items inside an `faq` block. A block itself can't be declared as a list inside `blocks`.
