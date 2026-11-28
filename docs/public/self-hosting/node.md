---
title: Deploy with Node.js
description: Run Pages CMS on a server or container with SQLite or libSQL.
---

Start from a project created with the Node.js target. See [Run locally](/docs/self-hosting/).

## 1. Register a production GitHub App

```bash
npm run setup:github-app -- --base-url cms.example.com
```

Credentials are written to `.env.production.local`. Move them to your host's secret store.

## 2. Set environment variables

In your host's secret store, set:

- `BETTER_AUTH_URL` to your public URL, such as `https://cms.example.com`.
- `BETTER_AUTH_SECRET` to a new value from `openssl rand -base64 32`.
- `DATABASE_URL` to a file on persistent storage, such as `file:/var/lib/pagescms/pagescms.db`, or a `libsql://` URL with `DATABASE_AUTH_TOKEN`.
- `ADMIN_EMAILS` to your verified sign-in email for instance-wide Admin access. Separate multiple addresses with commas; if unset, no one is an instance administrator.

See [Environment variables](/docs/self-hosting/environment-variables/) for the rest. Back up the database.

## 3. Build and start

```bash
npm install
npm run migrate
npm run build
npm start
```

The app listens on port 3000. Change it with `npm start -- --port 8080 --host 0.0.0.0`. Run it under a process manager such as systemd or PM2.

## 4. Add a reverse proxy

Terminate HTTPS at the proxy and forward to the app's port. The proxy must **overwrite** `X-Forwarded-For` with the client IP, since sign-in rate limits rely on it. Don't expose the app's port directly.

Open your URL and sign in with GitHub.
