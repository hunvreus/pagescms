# Authentication

Pages CMS uses Better Auth's SQLite adapter with the existing user, session, account, and verification identities. Authentication is request-scoped: configuration, database, and session services are initialized lazily and reused for the duration of one request.

## Local setup

Copy the example Worker variables and replace its placeholders:

```bash
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

`BETTER_AUTH_SECRET` must contain at least 32 characters. `BETTER_AUTH_URL` is the canonical local origin and fallback; local development also accepts the active `localhost` port selected by Vite. `DATABASE_URL` supplies local SQLite or remote libSQL/Turso application storage. Local development and `db:*` package scripts load `.env.local` automatically. Confirm that the target is disposable or backed up before applying migrations.

GitHub sign-in is enabled when both `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` are present. Configure the GitHub callback URL as:

```text
http://localhost:3000/api/auth/callback/github
```

Replace `3000` with the active Vite port when it differs. Better Auth accepts the active localhost port, but GitHub requires the callback URL to match it exactly.

Email-code sign-in is enabled when a trusted build-time plugin creates an email provider from the runtime environment. The bundled Resend plugin activates when both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured. A deployment can remove it and install a custom provider without changing authentication. See [`plugins.md`](./plugins.md).

## Runtime behavior

- Unauthenticated application routes redirect to `/sign-in` with a validated internal return path.
- Session reads are memoized per request and route results use short stale times to keep navigation responsive without making sign-out changes linger.
- GitHub credentials are optional, but both values must be configured together.
- Hosted mode still requires an access-policy plugin; authentication never bypasses application authorization.
