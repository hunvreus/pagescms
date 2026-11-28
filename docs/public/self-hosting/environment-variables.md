---
title: Environment variables
description: Every environment variable a self-hosted Pages CMS instance reads.
---

Locally, Pages CMS reads `.env.local`. In production, set variables in your host's secret store.

Generate secrets with `openssl rand -base64 32`. Keep `BETTER_AUTH_SECRET` and `CRYPTO_KEY` stable: changing them signs everyone out and makes stored credentials unreadable.

## Required

| Variable             | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Secret for sessions and encrypted tokens. At least 32 characters.                              |
| `BETTER_AUTH_URL`    | The app's public URL, for example `https://cms.example.com`. Locally, `http://localhost:3000`. |
| `DATABASE_URL`       | SQLite or libSQL URL. Locally, `file:.data/pagescms.db`. Not used on Cloudflare.               |

## GitHub App

Written for you by the [setup helper](/docs/self-hosting/github-app/).

| Variable                                           | Description                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GITHUB_APP_NAME`                                  | The app's name on GitHub                                                      |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | Sign-in with GitHub                                                           |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`          | Repository access through installations                                       |
| `GITHUB_APP_WEBHOOK_SECRET`                        | Verifies webhook deliveries                                                   |
| `CRYPTO_KEY`                                       | Encrypts stored GitHub credentials. Required with the App ID and private key. |

## Other sign-in methods

Optional. Collaborators without a GitHub account need at least one.

| Variable                                   | Description                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign-in with Google                                                           |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`      | Sign-in with a one-time email code, sent through [Resend](https://resend.com) |

Other email providers need a [plugin](/docs/extending/plugins/).

## Database and administration

| Variable                                          | Description                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_AUTH_TOKEN`                             | Token for a remote libSQL database, such as Turso                                                                          |
| `CACHE_DATABASE_URL`, `CACHE_DATABASE_AUTH_TOKEN` | Optional separate database for the rebuildable repository cache                                                            |
| `PAGESCMS_REQUIRE_ACCESS_POLICY`                  | Set to `true` to require an access-policy plugin at startup. Default `false`.                                              |
| `ADMIN_EMAILS`                                    | Comma-separated verified sign-in emails for instance-wide Admin access. Unset: no instance administrators.                 |
| `PAGESCMS_DEFAULT_LANGUAGE`                       | Fallback interface and email language: `en` (default), `fr`, `es`, `pt-BR`, or `zh-CN`.                                    |
| `SESSION_CACHE_SECONDS`                           | How long a session is trusted before it's rechecked. Default `60`. A revoked session can keep working for up to this long. |

The instance default applies when there is no supported user, cookie, or browser language. Email to a recipient without a saved preference also uses it. Set this variable to the previous Admin default when upgrading; the database value is no longer read.

On Cloudflare Workers, the database is the `DATABASE` D1 binding, with an optional `CACHE_DATABASE` binding, instead of URLs.

Administrators can manage sign-in rules under **Admin → Sign-in access**. Add email addresses, domains, or regular expressions; an empty list permits all users to sign up and sign in. Rules apply to email-code, GitHub, and Google sign-ins. Changing a rule affects new sign-ins; existing sessions remain active until revoked. Include an administrator's email or domain before restricting the list: `ADMIN_EMAILS` grants Admin access but does not bypass sign-in rules.

## Cache tuning

The defaults suit most instances. Times are in minutes unless the name ends in `_MS`.

| Variable                                     | Default | Description                                                                                                                       |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_CHECK_MIN`                           | `5`     | Age at which reading `.pages.yml` can trigger a background check                                                                  |
| `CACHE_CHECK_MIN`                            | `5`     | Age at which opening a cached folder rechecks its revision                                                                        |
| `FILE_TTL_MIN`                               | `1440`  | When to rebuild cached listings from scratch. `-1` turns this off.                                                                |
| `BRANCH_HEAD_TTL_MS`                         | `15000` | In-memory cache of branch heads                                                                                                   |
| `REPO_META_TTL_MS`                           | `15000` | In-memory cache of repository metadata                                                                                            |
| `WEBHOOK_PUSH_INCREMENTAL_MAX_FILES`         | `120`   | Above this many changed files, a push marks the affected folders stale instead of updating them file by file. `0` turns this off. |
| `WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES` | `800`   | Above this many changed files, a push marks the whole branch stale. `0` turns this off.                                           |

To clear a repository’s cache, enable [`settings.cache`](/docs/configuration/settings/) and use its **Cache** page.
