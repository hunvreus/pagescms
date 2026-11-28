---
title: Run locally
description: Run Pages CMS on your machine, the first step of any self-hosted deployment.
---

You'll need Node.js 22.19 or newer and a GitHub account that can register a GitHub App. No database server is needed.

## 1. Create a project

```bash
npm create pagescms@beta -- my-cms
cd my-cms
```

Pick a deployment target when prompted: Node.js, Cloudflare Workers, or the experimental Vercel and Netlify adapters. The creator offers to install dependencies, register a GitHub App and set up the local database. Any step you skip is covered below.

## 2. Register a GitHub App

```bash
npm run setup:github-app
```

Choose local development, use `http://localhost:3000` as the app URL, and give it a public webhook URL, such as a [smee.io](https://smee.io) channel. See [GitHub App](/docs/self-hosting/github-app/).

## 3. Start

To access the instance-wide Admin page, set `ADMIN_EMAILS` in `.env.local` to your verified sign-in email before starting the app. Separate multiple addresses with commas. If it is unset, no one is an instance administrator; the first user is not promoted automatically. See [Environment variables](/docs/self-hosting/environment-variables/).

```bash
npm run migrate -- --local
npm run dev
```

Open `http://localhost:3000` and sign in with GitHub.

If you use smee.io, forward webhooks in a second terminal:

```bash
npx smee-client --url <your-smee-url> --target http://localhost:3000/api/webhook/github
```

## Next

Deploy with [Node.js](/docs/self-hosting/node/), [Cloudflare Workers](/docs/self-hosting/cloudflare/), [Vercel](/docs/self-hosting/vercel/) or [Netlify](/docs/self-hosting/netlify/).
