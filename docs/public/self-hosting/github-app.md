---
title: GitHub App
description: Register the GitHub App that Pages CMS uses for sign-in, repository access and webhooks.
---

Every Pages CMS instance needs its own GitHub App. It signs users in, reads and writes repositories, and receives webhooks that keep the cache fresh. The setup helper registers it for you.

## Register

From your Pages CMS project:

```bash
npm run setup:github-app
```

It asks whether the app is for production or local development, then opens GitHub to create it. Run it on the same computer as your browser: GitHub hands the credentials back through a local callback. To preview the app without creating anything:

```bash
npm run setup:github-app -- --base-url cms.example.com --dry-run
```

| Option                     | Effect                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `--mode production\|local` | Production (default) or local development                                                         |
| `--base-url <url>`         | The app's URL; must be public HTTPS in production                                                 |
| `--webhook-url <url>`      | Public webhook endpoint; required in local mode, for example a [smee.io](https://smee.io) channel |
| `--org <slug>`             | Create the app under an organization instead of your account                                      |
| `--public`                 | Allow installs outside the app owner's account                                                    |
| `--templates`              | Also request permission to create repositories from templates                                     |
| `--output terminal`        | Print the credentials instead of writing a file                                                   |
| `--dry-run`                | Preview without creating anything                                                                 |
| `--yes`, `--overwrite`     | Skip prompts; `--overwrite` is required to update an existing file                                |

Credentials go to `.env.local` for local development and `.env.production.local` for production. Both are git-ignored.

Use separate apps for development and production, and never point a development instance at the production app.

In the GitHub App settings, turn off **Expire user authorization tokens**. This beta renews installation tokens automatically, but cannot renew an expired user token for someone who has signed in.

## What it requests

| Permissions               | Access                                                         |
| ------------------------- | -------------------------------------------------------------- |
| Contents                  | Read and write                                                 |
| Actions                   | Read and write, to run [actions](/docs/configuration/actions/) |
| Metadata                  | Read                                                           |
| Email addresses (account) | Read                                                           |
| Administration            | Read and write, only with `--templates`                        |

Webhook events: `push`, `delete`, `repository`, `installation_target` and `workflow_run`. Webhooks are delivered to `/api/webhook/github` and verified with `GITHUB_APP_WEBHOOK_SECRET`.

## Changing permissions later

When an app's permissions change, each installation's owner must approve the new permissions on GitHub. Until they do, features that depend on them won't work for that installation.
