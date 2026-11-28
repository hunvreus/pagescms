---
title: Media
description: Configure where uploads are stored and what path is written into content.
---

`media` defines the libraries used by image fields, file fields and images in rich text. Each library has two paths:

- `input`: the folder in the repository where files are stored.
- `output`: the public path your site serves them from, which is what gets written into content.

```yaml
media:
  input: public/uploads
  output: /uploads
```

With this, uploading `photo.jpg` stores `public/uploads/photo.jpg` and saves `/uploads/photo.jpg` in the field. Your site must serve that path; Pages CMS doesn't configure it. See [Quick start](/docs/quick-start/#3-tell-it-where-media-goes) for help finding the values.

## Shorthand

A string sets `input`, and `output` becomes the same path with a leading `/`:

```yaml
media: uploads # input: uploads, output: /uploads
```

## Multiple libraries

Use a list to give different content different folders or file types. Each library needs a unique `name`:

```yaml
media:
  - name: images
    label: Images
    icon: Image01
    input: public/images
    output: /images
    categories: [image]
    rename: safe
  - name: documents
    label: Documents
    input: public/files
    output: /files
    categories: [document, spreadsheet]
```

Fields use the first library unless they pick one with `options.media`:

```yaml
- name: brochure
  type: file
  options:
    media: documents
```

## Keys

| Key          | Description                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `input`      | **Required.** Repository folder, without leading or trailing `/`.                                                                |
| `output`     | **Required.** Public path written into content, without a trailing `/`. Can be a full URL.                                       |
| `name`       | **Required in a list.** Unique ID referenced by `options.media`.                                                                 |
| `label`      | Name shown in the sidebar.                                                                                                       |
| `icon`       | A [Hugeicons](https://hugeicons.com) name for the sidebar, such as `Image01`.                                                    |
| `categories` | Allowed file types by category: `image`, `document`, `video`, `audio`, `compressed`, `code`, `font`, `spreadsheet`.              |
| `extensions` | Allowed extensions, such as `[jpg, png, webp]`. Overrides `categories`.                                                          |
| `rename`     | Rename uploads: `false` keeps the original name (default), `true` or `safe` makes it URL-safe, `random` generates a unique name. |
| `commit`     | Commit messages and identity for this library. See [Settings](/docs/configuration/settings/#commit-messages).                    |
| `actions`    | Action buttons on the library page. See [Actions](/docs/configuration/actions/).                                                 |

Image, file and rich-text fields can override the allowed types and `rename` for that field.

## Cloud storage

<div data-search-exclude="availability" data-not-typeset class="alert border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" role="note" aria-label="Availability"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="hugeicons-info"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/><path d="M12 16V12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/><path d="M12.125 8.25H12M12.25 8.25C12.25 8.11193 12.1381 8 12 8C11.8619 8 11.75 8.11193 11.75 8.25C11.75 8.38807 11.8619 8.5 12 8.5C12.1381 8.5 12.25 8.38807 12.25 8.25Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></svg><section class="text-inherit"><p>Only available with a <a href="/pricing/">Pro subscription</a> on <a href="https://app.pagescms.org/">hosted Pages CMS</a>.</p></section></div>

A library can store files in an S3-compatible bucket instead of the repository. See [Cloud storage](/docs/guides/cloud-storage/).
