---
title: Deploy to Cloudflare Workers
description: Run Pages CMS on Cloudflare Workers with a D1 database.
---

Start from a project created with the Cloudflare target. See [Run locally](/docs/self-hosting/).

## 1. Create the database

```bash
npx wrangler login
npx wrangler d1 create pagescms
```

## 2. Configure the Worker

In `wrangler.jsonc`, set your Worker name and route, the database ID returned above, and your app's URL:

```jsonc
"d1_databases": [
  {
    "binding": "DATABASE",
    "database_name": "pagescms",
    "database_id": "YOUR_DATABASE_ID",
    "migrations_dir": "node_modules/pagescms/drizzle",
    "migrations_table": "__pagescms_core_d1_migrations"
  }
],
"vars": {
  "BETTER_AUTH_URL": "https://cms.example.com"
}
```

Leave the other generated settings as they are.

## 3. Add secrets

```bash
npm run setup:github-app -- --base-url cms.example.com --output terminal
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`, then add each GitHub App credential the same way. See [Environment variables](/docs/self-hosting/environment-variables/). Never put secrets in `wrangler.jsonc`.

To enable the instance-wide Admin page, add `ADMIN_EMAILS` as a Worker variable or secret containing your verified sign-in email. Separate multiple addresses with commas. If it is unset, no one is an instance administrator.

## 4. Migrate and deploy

```bash
npm run migrate:remote
npm run build
npm run deploy
```

Open your URL and sign in with GitHub.

## Notes

- **Separate cache database.** Create a second D1 database and add it to `d1_databases` with the binding `CACHE_DATABASE` and the same migration settings.
- **Local secrets.** The build may copy your local variables into `dist/worker/.dev.vars` for preview. Keep `dist/` out of shared build artifacts.
- **Plan limits.** Workers Free allows 10 ms of CPU per request, which large saves and webhooks can exceed, and D1 Free limits daily row writes. Use Workers Paid for a team. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
