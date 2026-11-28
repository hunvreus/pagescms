---
title: Deploy to Vercel
description: Deploy Pages CMS to Vercel with a hosted libSQL database.
---

> [!WARNING]
> The Vercel adapter is experimental. It needs a hosted libSQL database, such as Turso, because functions can't keep a local SQLite file.

## 1. Create a project

```bash
npm create pagescms@beta -- my-cms --target vercel
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

1. Push the project to a Git repository and import it into Vercel.
2. In the project settings, add `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (from `openssl rand -base64 32`), the database values, `CRYPTO_KEY` and the GitHub App credentials. Set `ADMIN_EMAILS` to your verified sign-in email for instance-wide Admin access; without it, no one is an instance administrator. See [Environment variables](/docs/self-hosting/environment-variables/).
3. Deploy, open the URL and sign in with GitHub.

## Notes

- **Uploads.** Files are sent as base64, and Vercel rejects requests above about 4.5 MB, so uploads top out around 3 MB. See [function limits](https://vercel.com/docs/functions/limitations).
- **Plugin endpoints.** `/api/*` and `/.well-known/*` go to the function. For other plugin paths, add a rewrite to `/api` in `vercel.json` before the SPA fallback.
- **Previews.** Use a separate database and separate credentials.
