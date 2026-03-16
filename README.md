# Pages CMS

[Pages CMS](https://pagescms.org) is an Open Source Content Management System for GitHub. It is particularly well suited for static site generators (e.g. Jekyll, Next.js, VuePress, Hugo).

It offers a user-friendly interface to edit the content of your website or app directly on GitHub.

<a href="https://demo.pagescms.org" target="_blank">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://pagescms.org/media/screenshots/nextjs-edit-with-bg-dark@2x.png">
<source media="(prefers-color-scheme: light)" srcset="https://pagescms.org/media/screenshots/nextjs-edit-with-bg-light@2x.png">
<img src="https://pagescms.org/media/screenshots/nextjs-edit-with-bg-light@2x.png">
</picture>
</a>

*[Watch the demo ▶](https://demo.pagescms.org)*

## Documentation

Go to [pagescms.org/docs](https://pagescms.org/docs).

## Community chat

[Join the Discord server](https://pagescms.org/chat) to get help with Pages CMS, share feedback, and connect with other users building with the platform.

## Built with

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [drizzle](https://orm.drizzle.team/)
- [Vercel](https://vercel.com/)
- [Supabase](https://supabase.tech/)
- [Resend](https://resend.com/) / SMTP

## Use online

The easiest way to get started is to use [the online version of Pages CMS](https://app.pagescms.org). You'll be able to log in with your GitHub account and get the latest version of Pages CMS.

This online version is identical to what's in this repo, but you can also install your own version locally or deploy it (for free) on Vercel following the steps below.

## Install and Deploy

### Create a GitHub App (Manifest Helper)

Whether you run Pages CMS locally or deploy it, you need a GitHub App.

This repo includes a setup helper that creates the app from a manifest and writes your local env values:

```bash
npm run setup:github-app -- --base-url http://localhost:3000
```

Useful options:

- `--owner-type personal|org` (default: `personal`)
- `--org <slug>` (required when owner type is `org`)
- `--app-name "Pages CMS (dev)"`
- `--env .env.local`
- `--no-open`

What it writes:

- `BASE_URL`
- `BETTER_AUTH_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_NAME`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_WEBHOOK_SECRET`

Manual setup is still possible via [GitHub App settings](https://github.com/settings/apps) (or org settings at `https://github.com/organizations/<org-name>/settings/apps`) with:

- Callback URL: `<BASE_URL>/api/auth/callback/github`
- Webhook URL: `<BASE_URL>/api/webhook/github`
- Setup URL: `<BASE_URL>/settings`
- Repository permissions:
  - Administration: Read & Write
  - Contents: Read & Write
  - Metadata: Read only
- Events:
  - Installation target
  - Repository
  - Push
  - Delete

### Environment variables

Variable | Comments
--- | ---
`BASE_URL` | **OPTIONAL**. If you're deploying to Vercel or working locally, you won't need that. If you're deploying elsewhere, you'll need to specify the base URL for the app (e.g. `https://mycustomdomain.com`).
`BETTER_AUTH_SECRET` | Secret used by Better Auth to sign/encrypt auth artifacts. Generate a long random value (e.g. `openssl rand -base64 32`). `AUTH_SECRET` is accepted as a fallback alias, but `BETTER_AUTH_SECRET` is the canonical variable.
`DATABASE_URL` | The database URL, including your credentials (e.g. `postgresql://user:password@example.com:6543`). If you're using [Supabase](https://supabase.com), use the "Transaction pooler" url.
`CRYPTO_KEY` | Used to encrypt/decrypt GitHub tokens in the database. On MacOS/Linux*, you can use `openssl rand -base64 32`.
`GITHUB_APP_ID` | GitHub App ID from your GitHub App details page.
`GITHUB_APP_NAME` | Machine name for your GitHub App (e.g. `pages-cms`), should be the slug the URL of your GitHub App details page.
`GITHUB_APP_PRIVATE_KEY` | PEM private key from the GitHub App (single-line escaped string in `.env.local`).
`GITHUB_APP_WEBHOOK_SECRET` | The secret you picked for your webhook. This is used to ensure the request is coming from GitHub.
`GITHUB_APP_CLIENT_ID` | GitHub App Client ID from your GitHub App details page.
`GITHUB_APP_CLIENT_SECRET` | GitHub App Client Secret from the GitHub App details page.
`EMAIL_PROVIDER` | **OPTIONAL**. Set to `resend` or `smtp`. If omitted, Pages CMS auto-selects `resend` when `RESEND_API_KEY` is set, otherwise `smtp` when `SMTP_HOST` is set.
`EMAIL_FROM` | Sender for authentication/invite emails, format `email@example.com` or `Name <email@example.com>`.
`RESEND_API_KEY` | Required when using `EMAIL_PROVIDER=resend`. You can create one from [Resend](https://resend.com). If set and `EMAIL_PROVIDER` is omitted, `resend` is selected automatically.
`RESEND_FROM_EMAIL` | Backward-compatible alias for `EMAIL_FROM` (used when `EMAIL_FROM` is not set).
`SMTP_HOST` | Required when using `EMAIL_PROVIDER=smtp`.
`SMTP_PORT` | **OPTIONAL**. SMTP port, defaults to `587`.
`SMTP_SECURE` | **OPTIONAL**. Set to `true` or `false`. Defaults to `true` when `SMTP_PORT=465`, otherwise `false`.
`SMTP_USER` | **OPTIONAL**. SMTP username. Must be set together with `SMTP_PASSWORD`.
`SMTP_PASSWORD` | **OPTIONAL**. SMTP password. Must be set together with `SMTP_USER`.
`CACHE_CHECK_MIN` | **OPTIONAL**. Backend reconcile interval (in minutes) for checking branch HEAD SHA against GitHub to detect external changes and invalidate stale file cache. Defaults to 5. Legacy aliases: `CACHE_RECONCILE_INTERVAL_MIN`, `CACHE_FILE_CHECK_TTL`.
`CONFIG_CHECK_MIN` | **OPTIONAL**. Backend config check interval (in minutes) when config sync is enabled. Defaults to 5. Legacy aliases: `CFG_CHECK_MIN`, `CONFIG_CHECK_TTL`.
`FILE_TTL_MIN` | **OPTIONAL**. Backend cache entry max age (in minutes) for `cache_file` rows (collections and media folders). Defaults to 1440 (1 day). Set to "-1" to prevent cache entry expiry, or "0" if you want no cache. Legacy alias: `FILE_CACHE_TTL`.
`PERMISSIONS_TTL_MIN` | **OPTIONAL**. Time to live (in minutes) for the permission cache, which controls access to file cache. Defaults to 60. Set to "0" if you want to always check permissions against the GitHub API. Legacy aliases: `PERM_TTL_MIN`, `PERMISSION_CACHE_TTL`.
`BRANCH_HEAD_TTL_MS` | **OPTIONAL**. In-memory TTL (in milliseconds) for cached branch HEAD SHA. Defaults to 15000. Legacy aliases: `HEAD_TTL_MS`, `BRANCH_HEAD_CACHE_TTL_MS`.
`REPO_META_TTL_MS` | **OPTIONAL**. In-memory TTL (in milliseconds) for cached repository metadata snapshot (repository info + branch list). Defaults to 15000. Legacy aliases: `SNAP_TTL_MS`, `REPO_SNAPSHOT_CACHE_TTL_MS`.
`CRON_SECRET` | Secret token used to secure the access of the cron API endpoint.

SMTP note: install `nodemailer` in your deployment/runtime with `npm install nodemailer` if you plan to use `EMAIL_PROVIDER=smtp`. If no provider can be resolved (no `EMAIL_PROVIDER`, no `RESEND_API_KEY`, and no `SMTP_HOST`), email sending fails with an explicit startup/runtime error.

### Local development

If you need a quick local PostgreSQL instance, you can run:

```bash
docker run --name pagescms-db -e POSTGRES_USER=pagescms -e POSTGRES_PASSWORD=pagescms -e POSTGRES_DB=pagescms -p 5432:5432 -d postgres:16
```

1. **Install the dependencies**: `npm install`
2. **Create env file**: copy `.env.local.example` to `.env.local` and fill values from the table above.
3. **Create your GitHub App env values**: run `npm run setup:github-app -- --base-url http://localhost:3000` (or configure manually).
4. **Create the database**: `npm run db:migrate`
5. **Run it**: `npm run dev`

Note: for local webhook delivery from GitHub, use a public tunnel URL as `--base-url` (for example with [ngrok](https://ngrok.com/)) and keep your local app running.

### Deploy on Vercel

1. **Create a PostgreSQL database**: I recommend using [Supabase](https://supabase.com), but any PostgreSQL database will do.
2. **Deploy to Vercel**: at this stage you have 2 choices:
    1. **Create a fork**: fork the `pages-cms/pages-cms` repo in your account and deploy that fork. This will allow you to get updates. **Make sure you define all of the environment variables listed above**.
    2. **Use the deploy button**:
    
        [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpages-cms%2Fpages-cms%2Ftree%2Fmain&project-name=pages-cms&repository-name=pages-cms&redirect-url=https%3A%2F%2Fpagescms.org&env=CRYPTO_KEY,GITHUB_APP_ID,GITHUB_APP_NAME,GITHUB_APP_PRIVATE_KEY,GITHUB_APP_WEBHOOK_SECRET,GITHUB_APP_CLIENT_ID,GITHUB_APP_CLIENT_SECRET,EMAIL_PROVIDER,EMAIL_FROM,RESEND_API_KEY,SMTP_HOST,SMTP_PORT,SMTP_SECURE,SMTP_USER,SMTP_PASSWORD,DATABASE_URL)

3. **Update your GitHub OAuth app**: you'll probably need to go back to your GitHub App settings to update some of the settings once you have the Vercel URL (e.g. "Callback URL" and "Webhook URL").

### Self-host

There are [plenty of other options](https://nextjs.org/docs/app/building-your-application/deploying#self-hosting): Fly.io, Digital Ocean, Render, SST, etc.

## Collaborator Export/Import (CSV)

If you need to migrate collaborator access between environments/databases, you can export/import collaborators as CSV.

### Export collaborators

```bash
npm run db:collaborators:export -- --output=collaborators.csv
```

Default output file is `collaborators-export.csv` in the current directory.

### Import collaborators

```bash
npm run db:collaborators:import -- --input=collaborators.csv --default-invited-by-email=admin@example.com
```

Supported flags:

- `--input=<path>`: required CSV file path
- `--replace`: delete existing collaborator rows before import
- `--default-invited-by-user-id=<userId>`: fallback inviter user id
- `--default-invited-by-email=<email>`: fallback inviter email

Notes:

- Import upserts by `(owner, repo, email)` (case-insensitive).
- `invitedBy` is optional; if no inviter can be resolved from CSV or fallback flags, it is imported as `null`.
- `userId` is optional; if omitted, import attempts to match by collaborator email.
- Existing rows are updated with CSV values (`type`, installation/repo ids, branch, owner/repo, `userId`, `invitedBy`).

CSV columns used:

- `type`
- `installationId`
- `ownerId`
- `repoId`
- `owner`
- `repo`
- `branch`
- `email`
- `userId`
- `invitedBy`
- `invitedByEmail`

### Legacy SQLite/libSQL export (old versions)

For old Pages CMS deployments that used libSQL/Turso, use the standalone legacy export script (shared as a gist) and then import the generated CSV with the command above.

Example run command for the legacy exporter:

```bash
SQLITE_URL="libsql://..." SQLITE_AUTH_TOKEN="..." \
npx -y -p @libsql/client node export-collaborators-legacy-libsql.mjs --out=collaborators.csv
```

## License

Everything in this repo is released under the [MIT License](LICENSE).
