---
title: Edit translations
description: Create, edit and copy translations of multilingual content.
---

When a project is [localized](/docs/configuration/localization/), entries get a **Language** menu in the header. It switches the content language you're editing. It doesn't change the language of the Pages CMS interface.

How translations behave depends on how the project stores them.

## Each language in its own file

For example `about.md` and `about.fr.md`.

- Each language is a separate file with its own draft and its own save.
- **Available** and **Missing** in the language menu tell you whether the file exists, not whether it's fully translated.
- To start a translation, pick a missing language. Start blank, or copy the current language as a starting point.
- Deleting a translation deletes only that language's file.
- Renaming or moving an entry moves all its translations together in one commit. Review the proposed paths before you confirm.

Use the language picker in the collection list to switch between translations. New entries and folders use the selected language.

## All languages in one file

For example `title: { en: About, fr: À propos }`.

- Localized fields change when you switch language. Shared fields, such as a publish date, stay the same across languages.
- All languages share one draft and are saved together.
- Required localized fields need a value in every language before you can save.

## Copy from another language

Use **Copy from…** in the header to copy a whole entry, or in a field's menu to copy a single field. You'll be asked to confirm before an existing value is replaced, even an empty one. Lists are copied as a whole.

Copying only changes your draft; nothing is saved until you choose **Save**.

## Preferences

A collection opens in its configured default language on your first visit. When you select another language, this browser remembers it for that collection and branch. A link that specifies a language opens that language.

Under **Account → Preferences → New translations**, choose whether to start blank, copy the current language or ask each time.
