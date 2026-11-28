---
title: Introduction
description: Pages CMS is an open-source content editor for websites whose content lives in a GitHub repository.
---

Pages CMS gives your website a content editor without moving your content. Your Markdown, YAML, JSON and media stay in your GitHub repository. Pages CMS shows editors a form and commits their changes back.

- **No content database.** Every save is a Git commit.
- **Any static site generator.** Hugo, Astro, Next.js, Jekyll, Eleventy: if it reads files, it works.
- **No Git for editors.** Invite people by email. They see forms, not files.
- **One config file.** `.pages.yml` in your repository describes what can be edited.

## Hosted or self-hosted

Use the hosted app at [app.pagescms.org](https://app.pagescms.org): sign in with GitHub and start. It's free, with a [Pro plan](/docs/billing/) per project for roles, cloud storage and higher API limits.

Or [run it yourself](/docs/self-hosting/). It's MIT-licensed and runs on Node.js or Cloudflare Workers.

Both read the same `.pages.yml`, so you can switch at any time.

## Next

- [Quick start](/docs/quick-start/): set up a repository and save your first edit.
- [Edit content](/docs/guides/editing/): for editors working on a project someone else set up.
- [Configuration](/docs/configuration/): everything `.pages.yml` can do.
