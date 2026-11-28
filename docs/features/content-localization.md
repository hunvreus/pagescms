# Content localization

Content localization is part of the open-source editor. It controls repository content, independently of the CMS interface language. Existing monolingual definitions keep their behavior.

## Languages

Define languages once, then opt each collection or fixed file into localization:

```yaml
i18n:
  default: en
  locales:
    - en
    - code: fr
      label: Français
```

Codes retain their exact spelling in files and keys. A missing label is generated from the code in English, the current interface language. Unknown display names fall back to the code. Codes must be unique, including case, and path-safe. Up to 50 languages are supported.

A content definition can replace `locales` with codes or `{code, label}` objects. Matching codes inherit global labels unless overridden. New local codes are allowed. Omit the list to inherit all project languages. If a replacement list excludes the inherited default, set a local `default` too. Without a project default, the first language is the default.

## Separate files

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
        separator: .
        default: omit
    fields:
      - { name: title, type: string }
      - { name: body, type: rich-text }
```

This stores English at `content/posts/about.md` and French at `content/posts/about.fr.md`. Translations share a canonical filename and subfolder path; titles and fields may differ. Existing unrelated filenames are not inferred to be translations.

`default: explicit` includes the default language in the path. This is the default when omitted. Filename rules support `position: prefix | suffix` and a separator consisting of dots, underscores or hyphens (default `.`). Ambiguous combinations of locale codes and separators are rejected.

Folder rules use `type: folder`:

| Position                   | French path for `content/posts/guides/about.md` |
| -------------------------- | ----------------------------------------------- |
| `root`                     | `fr/content/posts/guides/about.md`              |
| `collection`               | `content/posts/fr/guides/about.md`              |
| `parent`                   | `content/posts/guides/fr/about.md`              |
| `custom`, `after: content` | `content/fr/posts/guides/about.md`              |

`after` is required only for custom positioning. It names an exact repository-relative ancestor directory, including its full path when names repeat. It is not a substring search. Fixed files support filename rules and root, parent or custom folder positioning. `collection` requires a collection.

With omitted defaults, language suffixes/prefixes and language folders at the insertion position are reserved. For example, an English entry named `about.fr.md` would collide with the French translation of `about.md`; creation rejects it. Canonical paths must produce a distinct, reversible path for every configured language.

New-entry drafts for separate-file languages have distinct identities. The header language menu navigates between physical files. It reports **Available** or **Missing**, which describes file existence, not translation completeness. Choosing a missing language opens Start translation. Leave Copy current language content unchecked for a blank draft, or check it to copy the visible source, including unsaved changes. The source draft is flushed locally before navigation. Existing destination drafts are resumed without replacement; the initialization never writes to the repository. Saving requires create permission. Copying another language requires confirmation and changes only the destination draft. Source drafts remain intact. Standard links retain open-in-new-tab behavior.

Renaming or moving a file previews existing translation siblings. Keep the active language suffix or folder in the destination path; renaming does not change a file’s language. All displayed files move in one Git commit. Confirmation is tied to the branch revision; changed files, new siblings or destination collisions require another review. Each source is authorized before writing, with its destination supplied to the rename policy as `newPath`. Existing incoming references are not rewritten. Local sibling drafts move where possible; a draft changed concurrently is retained for recovery. Delete removes the selected language only.

## Languages inside one file

```yaml
content:
  - name: about
    type: file
    path: content/about.json
    i18n: { scheme: fields }
    fields:
      - { name: title, type: string, localized: true }
      - { name: published, type: boolean }
```

The stored shape is:

```json
{ "title": { "en": "About", "fr": "À propos" }, "published": true }
```

Place `localized: true` at the boundary that should contain language keys:

- On the content root: `{en: {title: ...}, fr: {title: ...}}`.
- On an object: `{hero: {en: {title: ..., image: ...}, fr: {...}}}`.
- On a field inside a shared object: `{hero: {title: {en: ..., fr: ...}, image: ...}}`.
- On a list: each language owns its own list, including order and length.
- Inside a shared object list: the list items are shared; localized values travel with their items during reordering.

A path has one localization boundary. Descendant `localized` flags under an already localized container are rejected. Unmarked fields are shared. JSON, YAML, TOML and their frontmatter formats are supported. A Markdown file has one raw body: localizing the top-level special `body` binding in this scheme is rejected. Use separate files or a normal rich-text value in structured data instead.

One persistent header menu changes the active language. Multilingual labels carry a globe. All languages belong to one file-wide draft, dirty state, conflict review and save. Pending language markers indicate unsaved changes. Field menus copy missing values from another language; the header also offers confirmed replacement. Copying preserves explicit empty strings, nulls, false, zero and empty lists unless replacement is requested. Independent translated lists are never aligned by index.

Unknown data and unknown locale keys are preserved. Validation checks configured languages; malformed locale maps remain readable and are reported before saving. Empty or missing languages are not filled with another language automatically. Required localized fields must have a translation, and existing translations follow normal field validation.

## Media, references and access

Image fields use the shared provider and preview system. Rich-text previews remain editor-only; saved content retains the configured delivery paths or URLs. Copying image/file values preserves the underlying asset. For structured entries, explicit file-relative Markdown and HTML image references are rebased when copying between separate files; prose links and code examples are untouched. Raw source copies remain verbatim.

Reference options use the editor's language when the referenced collection supports it, otherwise that collection's configured default. The existing `{path}` token still means the selected physical file path. `{locale}` is available in value and label templates. Switching a language does not rewrite existing reference values.

Text inputs and rich text support automatic text direction. Existing create/update/rename/delete permissions and SHA conflict checks apply; localization adds no locale-specific roles. Paths are checked by decoding and re-encoding the configured locale rule, including root/custom layouts outside the literal collection directory.

Unrestricted path templates, independently named translations, website fallback behavior, comparison panes and automatic synchronization are outside this version.

Save/create/rename/delete failures use the existing Sonner notification and retain the local draft. They do not repeat the same failure in an editor banner. Validation remains beside fields; conflicts open the review dialog. If the latest version cannot be loaded for conflict review, a titled inline recovery alert remains visible.

## Language menu

The header language control matches the 32px Save button and includes a dropdown chevron. The active language is checked and disabled. It uses a menu because it combines navigation and copy actions; collections use a standard Select for their language filter. Menu content fits its labels within the viewport; language names stay on one line and truncate when needed. Separate-file languages are grouped into Existing translations and Missing translations, with a check beside the active language. The configured language list is available immediately. Checking which sibling files exist runs in the background when the editor mounts, is cached for 30 seconds per account and entry, and is invalidated by content writes. Opening the menu does not start a fresh availability request. If the initial check is still pending, the menu keeps the known language labels visible while it checks paths.

Copy from… opens a submenu of other available sources. For separate files, only existing sibling files are offered; the source is its saved content. Confirmation is required before replacing the destination draft, including after the destination has already been saved. No repository write occurs until Save. If the source disappears, the destination draft remains intact. For languages inside one file, sources must contain locale data, including intentional empty values. Copying uses the current file-wide draft and defaults to filling missing values; the confirmation dialog allows replacing existing translations explicitly. Shared fields remain unchanged.

Localized fields show one badge beside their label, containing a globe, the active language and a dropdown chevron. Badge buttons have hover feedback; their menus use text-only action and language labels. Copy from… copies only that field from another configured language. Copying into a missing field updates the draft immediately; replacing any existing value, including an intentional empty value, requires confirmation. Readonly fields cannot be copied. Nested fields inside localized objects use the same field-level behavior without replacing siblings. Independently translated lists are copied as a whole; their item positions are not treated as matching translations. Switch editor language changes the entire editor, using the same missing-translation initialization as the header. No field has an independent active language. Shared fields have no language badge.

Collections show one language at a time. An explicit URL locale takes precedence over the last language selected for this account, repository, branch and collection in this browser. Otherwise, the collection opens in its configured default language. New entries and folders use the selected language. Single-file multilingual collections project fields using that language.

When header space is limited, collection search moves below the breadcrumb and the language selector shows a globe. Its menu still lists the active language and the other available languages.

Language-only collection navigation keeps the collection component, header and repository layout mounted. The previous table remains visible and inert while its replacement loads; search and folder context are retained. Failed reads have an inline error; action errors still have their usual single notification owner.

Account → Preferences → New translations offers Ask every time (the default), Start blank, or Copy current language for new translations. Ask every time opens the initialization dialog; its Remember this choice option saves Start blank or Copy current language and skips future prompts. Without that option, the checkbox choice is remembered but the prompt still appears. Both separate-file and single-file workflows use the same preference. Copy includes the visible unsaved draft, with no repository write until Save. Starting from a source that cannot be copied does not change that preference. The new-translation preference syncs across devices. The last language selected for each collection and the copy checkbox suggestion stay in the browser. Existing-language navigation needs no initialization dialog. Copy from… remains available after creation and requires confirmation before replacing content.

Content-editing preference changes show a success notification after the server confirms the save. Failed saves restore the previous selection and show one error notification.
