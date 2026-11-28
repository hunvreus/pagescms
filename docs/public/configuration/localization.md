---
title: Localization
description: Configure multilingual content stored as separate files or as language keys inside one file.
---

Localization lets editors maintain content in several languages. It doesn't translate the Pages CMS interface. For the editing side, see [Edit translations](/docs/guides/translations/).

Pick the scheme that matches how your site already stores translations:

- `files`: one file per language, such as `about.md` and `about.fr.md`.
- `fields`: language keys inside one file, such as `title: { en: About, fr: À propos }`.

## 1. Declare your languages

At the root of `.pages.yml`:

```yaml
i18n:
  default: en
  locales:
    - en
    - code: fr
      label: Français
```

Codes must match exactly what's in your filenames or keys. Labels are optional. Up to 50 languages.

## 2. Localize content

Add `i18n` to each collection or file that has translations. Everything else stays single-language.

### One file per language

In `.pages.yml`, configure the collection to use one file per language:

```yaml
content:
  - name: posts
    type: collection
    path: content/posts
    i18n:
      scheme: files
      path:
        type: filename
        position: suffix
        default: omit
    fields:
      - name: title
        type: string
      - name: body
        type: rich-text
```

This pairs `content/posts/about.md` (English) with `content/posts/about.fr.md` (French).

`path` describes where each language's file lives. It's required for this scheme.

**By filename:**

| Key         | Values                                                                                    | Default    |
| ----------- | ----------------------------------------------------------------------------------------- | ---------- |
| `type`      | `filename`                                                                                | Required   |
| `position`  | `prefix` or `suffix`                                                                      | Required   |
| `separator` | `.`, `_` or `-`                                                                           | `.`        |
| `default`   | `omit`: no code for the default language. `explicit`: always add it, as in `about.en.md`. | `explicit` |

**By folder**, with `type: folder`. For the file `content/posts/guides/about.md` and `default: omit`, French goes to:

| `position`                     | French file                        |
| ------------------------------ | ---------------------------------- |
| `root`                         | `fr/content/posts/guides/about.md` |
| `collection`                   | `content/posts/fr/guides/about.md` |
| `parent`                       | `content/posts/guides/fr/about.md` |
| `custom` with `after: content` | `content/fr/posts/guides/about.md` |

`after` must name an exact ancestor folder. Single files support filename rules and the `root`, `parent` and `custom` folder positions.

With `default: omit`, names that look like translations are reserved. For example, an English file can't be called `about.fr.md`.

### Languages in one file

In `.pages.yml`, mark the fields that have a value for each language:

```yaml
content:
  - name: home
    type: file
    path: data/home.json
    i18n:
      scheme: fields
    fields:
      - name: title
        type: string
        localized: true
      - name: published
        type: boolean
```

For example, `data/home.json` could contain:

```json
{
  "title": { "en": "Home", "fr": "Accueil" },
  "published": true
}
```

Fields marked `localized: true` hold one value per language; unmarked fields are shared. Where you put `localized` decides the shape:

| `localized: true` on     | Stored as                                      |
| ------------------------ | ---------------------------------------------- |
| A field                  | `title: { en: …, fr: … }`                      |
| An object                | `hero: { en: { title: … }, fr: { title: … } }` |
| A list                   | A separate list per language                   |
| The content entry itself | `{ en: { title: … }, fr: { title: … } }`       |

Mark only one level: don't add `localized` inside something that's already localized.

This scheme works with JSON, YAML, TOML and their front matter variants. The Markdown `body` can't be localized inside one file; use one file per language for translated bodies.

## Per-content languages

A collection or file inherits every project language. To use a subset, set `locales` on its `i18n`; this replaces the project list. If that subset leaves out the project's default, also set `default`.

```yaml
i18n:
  scheme: files
  locales: [en, de]
  path: { type: filename, position: suffix }
```

## Good to know

- Missing translations don't fall back to another language. Your site decides what to show.
- Required localized fields need a value in every language.
- Keys Pages CMS doesn't recognize are preserved.
- [Reference fields](/docs/configuration/fields/reference/) pick entries in the current language when the target collection is localized; `{locale}` is available in their templates.
- Localization uses the normal create, edit, rename and delete permissions. There are no per-language permissions.
