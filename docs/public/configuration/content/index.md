---
title: Collections and files
description: Configure collections, single files and sidebar groups with the content key.
---

`content` is a list. Each item is one of three types:

- `collection`: a folder of files that share fields, such as blog posts.
- `file`: one file with its own fields, such as site settings.
- `group`: a sidebar section containing other items.

## Collections

Add a collection to `.pages.yml` to edit files in a folder:

```yaml
content:
  - name: posts
    label: Posts
    type: collection
    path: content/posts
    fields:
      - name: title
        type: string
      - name: body
        type: rich-text
```

Every file in `path` with the matching extension is an entry. New entries are created there, named by the [`filename`](/docs/configuration/content/filename/) template.

## Files

Add a file to `.pages.yml` to edit it individually:

```yaml
content:
  - name: settings
    label: Site settings
    type: file
    path: data/settings.yml
    fields:
      - name: title
        type: string
      - name: description
        type: text
```

`path` is the full path to the file, including its name. If the file is a top-level list, such as an array of authors, set `list: true`:

```yaml
- name: authors
  type: file
  path: data/authors.json
  list: true
  fields:
    - name: name
      type: string
    - name: avatar
      type: image
```

Without `fields`, a file opens in a source editor. See [File formats](/docs/configuration/content/formats/).

## Groups

Groups organize the sidebar. They don't change where content is stored, and they can be nested.

```yaml
content:
  - name: blog
    label: Blog
    type: group
    items:
      - name: posts
        type: collection
        path: content/posts
        fields: [{ name: title, type: string }]
      - name: authors
        type: collection
        path: content/authors
        fields: [{ name: name, type: string }]
```

## Keys

| Key          | Applies to       | Description                                                                                                                         |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | All              | **Required.** Unique ID: letters, numbers, `-` and `_`. Must be unique across all collections and files, including those in groups. |
| `type`       | All              | **Required.** `collection`, `file` or `group`.                                                                                      |
| `label`      | All              | Name shown in the sidebar. Defaults to `name`.                                                                                      |
| `icon`       | Collection, file | A [Hugeicons](https://hugeicons.com) name, such as `News01`, for the sidebar.                                                       |
| `path`       | Collection, file | **Required.** Folder (collection) or file path (file), relative to the repository root, without leading or trailing `/`.            |
| `fields`     | Collection, file | The [fields](/docs/configuration/fields/) to edit.                                                                                  |
| `format`     | Collection, file | How files are parsed. Inferred from the extension; see [File formats](/docs/configuration/content/formats/).                        |
| `delimiters` | Collection, file | Custom front matter delimiters, such as `+++` or `["<!--", "-->"]`.                                                                 |
| `filename`   | Collection       | Template for new filenames. See [Filenames](/docs/configuration/content/filename/).                                                 |
| `view`       | Collection       | Columns, sorting, search and tree layout. See [Collection views](/docs/configuration/content/view/).                                |
| `subfolders` | Collection       | Set `false` to ignore files in subfolders.                                                                                          |
| `exclude`    | Collection       | Filenames to ignore, such as `[README.md]`.                                                                                         |
| `list`       | File             | Set `true` when the file is a top-level array.                                                                                      |
| `operations` | Collection, file | Turn off create, rename or delete. See [below](#operations).                                                                        |
| `i18n`       | Collection, file | Translation storage. See [Localization](/docs/configuration/localization/).                                                         |
| `commit`     | Collection, file | Commit messages and identity for this content. See [Settings](/docs/configuration/settings/#commit-messages).                       |
| `actions`    | Collection, file | Action buttons. See [Actions](/docs/configuration/actions/).                                                                        |
| `items`      | Group            | **Required.** The collections, files and groups inside it.                                                                          |

## Operations

By default editors can create, rename and delete collection entries, and create or delete a single file. Set an operation to `false` to turn it off:

```yaml
- name: legal
  type: collection
  path: content/legal
  operations:
    create: false
    delete: false
```

Set `operations: false` to disable every available operation. Editors can still edit existing content.

| Operation | Collection default | File default                            |
| --------- | ------------------ | --------------------------------------- |
| `create`  | `true`             | `true`: create the file if it's missing |
| `rename`  | `true`             | Not available                           |
| `delete`  | `true`             | `true`                                  |

Operations apply to everyone, managers included. They limit what the interface offers; they don't grant access.

## Sidebar icons

`icon` takes a name from the [Hugeicons free set](https://hugeicons.com/) in PascalCase, such as `News01` or `News01Icon`. Unknown names fall back to the default icon. Media libraries also accept an [`icon`](/docs/configuration/media/#keys).
