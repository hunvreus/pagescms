---
title: Upgrading
description: Move a self-hosted instance from Pages CMS 2.x to the 3.0 beta.
---

## From 2.x

Version 3 is a new application with a new database. Your content and `.pages.yml` stay in GitHub. The only data to move is collaborators.

### 1. Deploy 3.x next to 2.x

Deploy 3.x as a new instance with a fresh database, following the guide for your platform. Keep 2.x running so you can roll back.

### 2. Move collaborators

You'll need `psql` and a read-only backup of the 2.x PostgreSQL database. In your 3.x project, point the script at the backup and the new database, then run it:

```bash
export COLLABORATORS_SOURCE_URL="postgres://..."
export DATABASE_URL="libsql://..."
export DATABASE_AUTH_TOKEN="..."
npm run migrate:2x
```

On Cloudflare, generate SQL and apply it to D1 instead:

```bash
npm run migrate:2x -- --output=collaborators.sql
npx wrangler d1 execute DATABASE --remote --file=collaborators.sql
```

Assignments link to accounts by email when people sign in again. The script imports everything in one transaction and stops, without writing anything, on an assignment it can't convert safely: a branch-restricted one, or one without a repository ID. Fix those rows in a working copy of the backup, or remove them and recreate them by hand.

### 3. Update configuration

- Open **Configuration** in each project and fix any validation errors.
- Move translations to root `i18n` and field-level `localized`. See [Localization](/docs/configuration/localization/).
- Replace Lucide icon names with [Hugeicons](https://hugeicons.com) names.
- Port custom fields to plugins. See [porting a version 2 field](/docs/extending/field-api/#porting-a-version-2-field).
- If the domain changed, update the GitHub App's callback, setup and webhook URLs.

### 4. Switch over

Sign in, save an edit, check a collaborator's access and push a change to GitHub to confirm webhooks arrive. Then move traffic to the new instance.
