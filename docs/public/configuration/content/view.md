---
title: Collection views
description: Choose the columns, sorting, search and layout of a collection list.
---

`view` controls how a collection's entries are listed. Without it, Pages CMS lists each entry by its primary field.

```yaml
- name: posts
  type: collection
  path: content/posts
  view:
    fields: [title, author.name, date, draft]
    primary: title
    sort: [date, title]
    search: [title, tags]
    default:
      sort: date
      order: desc
```

## Keys

| Key              | Description                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fields`         | Columns to show, in order. Use dots for nested fields, such as `author.name`.                                                                                                                                         |
| `primary`        | The field used as each entry's label and for `{primary}` in [filenames](/docs/configuration/content/filename/). Defaults to `title`, `name` or `label`, then the first text, number or date field, then the filename. |
| `sort`           | Fields editors can sort by.                                                                                                                                                                                           |
| `search`         | Fields searched by the search box.                                                                                                                                                                                    |
| `default.sort`   | Field to sort by initially.                                                                                                                                                                                           |
| `default.order`  | `asc` or `desc`.                                                                                                                                                                                                      |
| `default.search` | Initial search query.                                                                                                                                                                                                 |
| `foldersFirst`   | `true` to list folders before entries.                                                                                                                                                                                |
| `layout`         | `list` (default) or `tree`.                                                                                                                                                                                           |
| `node`           | Tree layout settings; see below.                                                                                                                                                                                      |

## Tree layout

For content organized as nested folders, such as documentation, `layout: tree` shows entries as an expandable tree. Each folder is represented by a node file inside it:

```yaml
view:
  layout: tree
  node:
    filename: index.md
    hideDirs: nodes
```

- `filename`: the file that represents its folder, such as `index.md` or `_index.md`. `node: index.md` is shorthand.
- `hideDirs`: hide folders that have a node file (`nodes`), that don't (`others`), or `all`.
