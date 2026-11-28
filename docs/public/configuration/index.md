---
title: Configuration overview
description: The structure of .pages.yml, the file that tells Pages CMS what to edit.
---

`.pages.yml` sits at the root of your repository and describes what can be edited: which folders and files, which fields they have, and where uploads go. It describes your existing files; it doesn't change how your site is built.

## Edit it

Managers can open **Configuration** in any project to edit `.pages.yml` with validation and autocompletion. You can also commit it like any other file. Each branch reads its own copy.

Unknown keys and wrong types are errors. The editor highlights them and won't save until they're fixed.

## A complete example

```yaml title=".pages.yml"
media:
  input: public/uploads
  output: /uploads

content:
  - name: posts
    label: Blog posts
    type: collection
    path: content/posts
    view:
      fields: [title, date]
      default: { sort: date, order: desc }
    fields:
      - name: title
        type: string
        required: true
      - name: date
        type: date
      - name: cover
        type: image
      - name: seo
        component: seo
      - name: body
        type: rich-text

  - name: settings
    label: Site settings
    type: file
    path: data/settings.json
    fields:
      - name: title
        type: string
      - name: seo
        component: seo

components:
  seo:
    type: object
    fields:
      - name: description
        type: text
      - name: image
        type: image

actions:
  - name: deploy
    label: Deploy site
    workflow: deploy.yml

settings:
  content:
    merge: true
```

## Top-level keys

| Key                                             | Description                                                 |
| ----------------------------------------------- | ----------------------------------------------------------- |
| [`content`](/docs/configuration/content/)       | Collections, single files and sidebar groups                |
| [`media`](/docs/configuration/media/)           | Where uploads are stored and the paths written into content |
| [`components`](/docs/configuration/components/) | Reusable field definitions                                  |
| [`i18n`](/docs/configuration/localization/)     | Content languages                                           |
| [`actions`](/docs/configuration/actions/)       | Buttons that run GitHub Actions workflows                   |
| [`settings`](/docs/configuration/settings/)     | Saving, commit messages, cache and configuration editing    |

Most projects only need `content` and `media`. Field types are listed under [Fields](/docs/configuration/fields/).

## For AI agents

The [compact configuration reference](/docs/reference/) summarizes the whole format on one page. Pages CMS uses it to generate configurations, and it works well as context for coding agents.
