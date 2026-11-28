---
title: Settings
description: Control how content is saved, commit messages and authors, configuration editing and the cache.
---

`settings` holds repository-wide options. All of them are optional.

```yaml
settings:
  content:
    merge: true
  commit:
    identity: user
    allowCustomMessage: true
    templates:
      update: 'content: update {path}'
  cache: true
```

| Key                         | Default   | Description                                                                               |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `content.merge`             | `false`   | Keep keys your fields don't describe. See [below](#content-merging).                      |
| `commit.templates`          | See below | Commit message templates.                                                                 |
| `commit.identity`           | `app`     | Who is recorded as the committer.                                                         |
| `commit.allowCustomMessage` | `false`   | Let editors write their own commit message when saving.                                   |
| `cache`                     | `false`   | Show the **Cache** page to managers, to inspect or clear cached data.                     |
| `config`                    | `true`    | Set `false` to hide the **Configuration** editor. You can still edit `.pages.yml` in Git. |

## Content merging

> [!CAUTION]
> By default, saving a structured file writes exactly what the form contains. Keys in the file that aren't described by your fields are removed. That's fine when your fields describe the whole file, and destructive when they don't.

If you only configure some of a file's keys, turn merging on:

```yaml
settings:
  content:
    merge: true
```

With merging on, Pages CMS updates the fields you configured and leaves everything else as it was. Clearing a configured field still removes its value.

## Commit messages

Default templates:

| Operation | Template                                        |
| --------- | ----------------------------------------------- |
| `create`  | `Create {path} (via Pages CMS)`                 |
| `update`  | `Update {path} (via Pages CMS)`                 |
| `delete`  | `Delete {path} (via Pages CMS)`                 |
| `rename`  | `Rename {oldPath} to {newPath} (via Pages CMS)` |

Tokens:

| Token                                                      | Value                                    |
| ---------------------------------------------------------- | ---------------------------------------- |
| `{action}`                                                 | `create`, `update`, `delete` or `rename` |
| `{path}`, `{filename}`                                     | The file's path, or just its name        |
| `{oldPath}`, `{newPath}`, `{oldFilename}`, `{newFilename}` | For renames                              |
| `{name}`                                                   | The content or media `name`              |
| `{owner}`, `{repo}`, `{branch}`                            | The repository and branch                |
| `{userName}`, `{userEmail}`                                | The editor, when known                   |

`commit` can also be set on a [collection or file](/docs/configuration/content/#keys) or a [media library](/docs/configuration/media/#keys) to override these settings for that content:

```yaml
media:
  - name: images
    input: public/images
    output: /images
    commit:
      templates:
        create: 'media: add {filename}'
```

## Commit identity

`commit.identity` sets who appears on commits:

- `app` (default): managers' commits show their GitHub account; collaborators' commits show the GitHub App.
- `user`: every commit shows the editor's name and email.

Use `user` when you want collaborators' names in your Git history.
