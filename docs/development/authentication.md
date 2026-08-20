# Authentication

Pages CMS uses Better Auth with the existing PostgreSQL user, session, account, and verification tables. Authentication is request-scoped: configuration, database, and session services are initialized lazily and reused for the duration of one request.

## Local setup

Copy the example Worker variables and replace its placeholders:

```bash
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

`BETTER_AUTH_SECRET` must contain at least 32 characters. `BETTER_AUTH_URL` must match the local origin. `DATABASE_URL` is used locally; Workers deployments should use the `HYPERDRIVE` binding instead. The Node development adapter and `db:*` package scripts load `.env.local` automatically. Confirm that the URL points to a disposable or development database before applying migrations.

GitHub sign-in is enabled when both `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` are present. Configure the GitHub callback URL as:

```text
http://localhost:3000/api/auth/callback/github
```

Email-code sign-in is enabled only when a trusted build-time plugin contributes an email provider. This keeps Resend, SMTP gateways, and proprietary delivery systems outside the core and out of deployments that do not use them. See [`plugins.md`](./plugins.md).

## Runtime behavior

- Unauthenticated application routes redirect to `/sign-in` with a validated internal return path.
- Session reads are memoized per request and route results use short stale times to keep navigation responsive without making sign-out changes linger.
- GitHub credentials are optional, but both values must be configured together.
- Hosted mode still requires an access-policy plugin; authentication never bypasses application authorization.
