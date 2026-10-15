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

Google sign-in is enabled when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present. Create a web application OAuth client with the exact callback `<BETTER_AUTH_URL>/api/auth/callback/google`. Use separate Google Cloud projects for Local, Staging, and Production, as required by [Google's deployment-tier policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance). Staging uses `https://staging.pagescms.org/api/auth/callback/google`. Request only `openid`, `email`, and `profile`; Google sign-in does not grant GitHub repository access. Repository access still requires a linked GitHub account or an authorized collaborator membership.

Email-code sign-in is enabled when a trusted build-time plugin creates an email provider from the runtime environment. The bundled Resend plugin activates when both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured. A deployment can remove it and install a custom provider without changing authentication. See [`plugins.md`](./plugins.md).

## Runtime behavior

Ordinary entry and media mutations select the current user token without a GitHub repository probe. A bounded, credential-hashed hint can reuse the credential source selected by an earlier read; it contains no token or authorization grant. Every installation-backed mutation reads current collaborator membership and runs application policy for its branch, resource, and path. User-token rejection can retry a single-write operation once under installation credentials only after fresh membership lookup and application authorization. Conflicts, ambiguous failures, rate limits, completed writes, multi-write renames, and external upload workflows never trigger automatic credential retries. Cold multi-write operations without a credential-choice hint retain the initial probe, because they cannot safely discover credentials by retrying. Reads and repository management retain their existing GitHub access checks.

- OAuth identities must report a verified email before user creation, account linking, or sign-in. GitHub is not exempted as a trusted provider. Email-code sign-in retains its own proof-of-email flow.
- Deployment-admin allowlisting requires a verified email. Pending collaborator grants match email only for verified users; already-bound grants match the immutable user ID.
- Invitation GET requests only report status and expose a masked address to guests. Acceptance is an authenticated POST for the matching verified account. Invitation creation, acceptance, removal, and send-failure rollback use atomic application-database batches.
- Configuration source editing and workflow mutations require direct GitHub user credentials with repository write permission. Collaborators using installation credentials cannot change `.pages.yml`, including through ordinary file/media mutation endpoints. Parsed configuration remains available to render permitted content fields.
- Branch creation checks admission to both the source and destination branch before writing.
- Media previews resolve the effective repository principal, apply hosted policy, and use a restrictive sandbox CSP even on conditional responses. Client errors do not expose internal exception messages.
- Installation/repository removal atomically revokes collaborators and their pending invitations before disposable cache cleanup. Application and cache storage can be separate databases: failed cache cleanup is retried, not treated as a distributed transaction.
- Unauthenticated application routes redirect to `/sign-in` with a validated internal return path.
- Session reads are memoized per request and route results use short stale times to keep navigation responsive without making sign-out changes linger.
- GitHub and Google credentials are optional; each provider's client ID and secret must be configured together.
- Hosted mode still requires an access-policy plugin; authentication never bypasses application authorization.
