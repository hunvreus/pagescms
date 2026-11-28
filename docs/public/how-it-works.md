---
title: How it works
description: Branches, configuration, drafts, saving, publishing, access and caching in Pages CMS.
---

Your content lives in your GitHub repository. Pages CMS edits it, and your existing deployment publishes it.

## Branches and configuration

A project is one GitHub repository. You work on one branch at a time, and each branch has its own `.pages.yml`, so you can try a configuration change on a branch before merging it.

`.pages.yml` describes files that already exist: which ones are editable, their fields, and where media goes. It doesn't change how your site is built. See [Configuration](/docs/configuration/).

## Saving

- **Drafts.** Unsaved changes stay in your browser, so a closed tab doesn't lose work. Nobody else sees them.
- **Saves.** Each save is one commit to the current branch.
- **Conflicts.** If someone else changed the file since you opened it, Pages CMS shows both versions field by field and you choose before saving. Nothing is overwritten.

## Publishing

Pages CMS commits; it doesn't deploy. If your site rebuilds on every push, a save goes live when that build finishes. To deploy on demand, add an [action](/docs/configuration/actions/).

## People

- **Managers** sign in with GitHub and have write access to the repository. They can do everything: edit, change the configuration, invite people and run actions.
- **Collaborators** are invited by email and don't need a GitHub account. They edit the content and media `.pages.yml` exposes. Their saves are committed through the GitHub App.

On hosted Pro projects, [roles](/docs/guides/roles/) can limit collaborators further.

## Caching

Pages CMS caches file listings and content from GitHub. Webhooks keep the cache current on every push, and Pages CMS rechecks periodically. GitHub always holds the real data. If something looks stale, enable [`settings.cache`](/docs/configuration/settings/) to clear it from the **Cache** page.
