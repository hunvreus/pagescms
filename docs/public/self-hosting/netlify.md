---
title: Deploy to Netlify
description: Deploy Pages CMS to Netlify with a hosted libSQL database.
---

> [!WARNING]
> The Netlify adapter is experimental. It needs a hosted libSQL database, such as Turso, because functions can't keep a local SQLite file.

## 1. Create a project

```bash
npm create pagescms@beta -- my-cms --target netlify
cd my-cms
npm install
```

## 2. Migrate the database

```bash
export DATABASE_URL="libsql://your-database.example"
export DATABASE_AUTH_TOKEN="your-database-token"
npm run migrate
```

## 3. Register a GitHub App

```bash
npm run setup:github-app -- --base-url cms.example.com --output terminal
```

## 4. Deploy

1. Push the project to a Git repository and import it into Netlify.
2. In the site settings, add `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (from `openssl rand -base64 32`), the database values, `CRYPTO_KEY` and the GitHub App credentials. Set `ADMIN_EMAILS` to your verified sign-in email for instance-wide Admin access; without it, no one is an instance administrator. See [Environment variables](/docs/self-hosting/environment-variables/).
3. Deploy, open the URL and sign in with GitHub.

## Notes

- **Uploads.** Files are sent as base64, so uploads top out around 4 MB. See [function limits](https://docs.netlify.com/build/functions/configuration/).
- **Plugin endpoints.** `/api/*` and `/.well-known/*` go to the function. For other plugin paths, add them to `config.path` in `netlify/functions/api.mjs`.
- **Previews.** Use a separate database and separate credentials.
