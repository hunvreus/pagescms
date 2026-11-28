---
title: Fields overview
description: Field types, the keys every field shares, lists and validation.
---

Fields turn the keys in your files into form inputs. Each field has a `name`, the key in the file, and a `type`:

```yaml
fields:
  - name: title
    type: string
    required: true
  - name: tags
    type: string
    list: true
```

## Field types

| Type                                                 | For                                            | Stored as                    |
| ---------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| [`string`](/docs/configuration/fields/string/)       | Short text: titles, names, slugs               | String                       |
| [`text`](/docs/configuration/fields/text/)           | Plain multi-line text: summaries, notes        | String                       |
| [`rich-text`](/docs/configuration/fields/rich-text/) | Formatted content                              | Markdown or HTML string      |
| [`code`](/docs/configuration/fields/code/)           | Code and snippets, with syntax highlighting    | String                       |
| [`number`](/docs/configuration/fields/number/)       | Prices, weights, ordering                      | Number                       |
| [`boolean`](/docs/configuration/fields/boolean/)     | On/off flags                                   | `true` or `false`            |
| [`date`](/docs/configuration/fields/date/)           | Dates and times                                | Formatted string             |
| [`select`](/docs/configuration/fields/select/)       | A choice from a fixed list                     | String, or a list of strings |
| [`reference`](/docs/configuration/fields/reference/) | A link to an entry in another collection       | String, or a list of strings |
| [`image`](/docs/configuration/fields/image/)         | Images from a media library                    | Path, or a list of paths     |
| [`file`](/docs/configuration/fields/file/)           | Documents and other files                      | Path, or a list of paths     |
| [`object`](/docs/configuration/fields/object/)       | A group of nested fields                       | Object                       |
| [`block`](/docs/configuration/fields/block/)         | One of several field groups, for page builders | Object with a type key       |
| [`uuid`](/docs/configuration/fields/uuid/)           | A stable unique ID                             | String                       |

Self-hosted instances can add their own types with [plugins](/docs/extending/custom-field/).

## Keys for every field

| Key           | Description                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| `name`        | **Required.** The key in the file. Letters, numbers, `-` and `_`.                             |
| `type`        | **Required**, unless `component` is set. One of the types above.                              |
| `component`   | Use a [component](/docs/configuration/components/) instead of `type`.                         |
| `label`       | Label shown in the form. Defaults to `name`. `false` hides the label.                         |
| `description` | Help text shown under the field.                                                              |
| `required`    | `true` to require a value before saving.                                                      |
| `default`     | Value for new entries.                                                                        |
| `readonly`    | `true` to show the value without allowing edits. Applies to everything nested inside.         |
| `hidden`      | `true` to hide the field from the form. Its value is still saved.                             |
| `list`        | Repeat the field. See [Lists](#lists).                                                        |
| `pattern`     | Validate `string` and `text` values with a regular expression. See [Validation](#validation). |
| `localized`   | Store one value per language. See [Localization](/docs/configuration/localization/).          |
| `options`     | Settings specific to the type. See each type's page.                                          |

## The `body` field

In Markdown and other front matter files, a field named `body` holds the content below the front matter, not a front matter key. Any field type works, but `rich-text` is the usual choice:

```yaml
fields:
  - name: title
    type: string
  - name: body
    type: rich-text
```

## Lists

`list: true` turns any field into a list editors can add to, remove from and reorder:

```yaml
- name: tags
  type: string
  list: true
```

A saved value in YAML or Markdown front matter might look like:

```yaml
tags: [news, launch]
```

Use an object to set limits and collapse long lists:

```yaml
- name: faq
  type: object
  list:
    min: 1
    max: 10
    collapsible:
      collapsed: true
      summary: '{index}. {question}'
  fields:
    - name: question
      type: string
    - name: answer
      type: rich-text
```

| `list` key              | Description                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `min`, `max`            | Minimum and maximum number of items.                                                                                      |
| `collapsible`           | For `object` and `block` lists: `true`, or `{ collapsed, summary }`.                                                      |
| `collapsible.collapsed` | `true` to start with items collapsed.                                                                                     |
| `collapsible.summary`   | Text shown on a collapsed item. Use `{index}` for its position (from 1) and `{field}` or `{fields.field}` for its values. |

## Validation

`required`, `list.min` and `list.max`, and type options such as `minlength` are checked before saving. For `string` and `text` fields, add `pattern`:

```yaml
- name: slug
  type: string
  pattern: '^[a-z0-9-]+$'
```

Add a message to explain the rule:

```yaml
- name: sku
  type: string
  pattern:
    regex: '^[A-Z]{3}-\d{4}$'
    message: Use the format ABC-1234
```

Patterns use JavaScript regular expression syntax and must match the whole value you intend: anchor them with `^` and `$`.
