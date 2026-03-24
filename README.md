# Pages CMS

[Pages CMS](https://pagescms.org) is an open source CMS for GitHub repositories. It is especially well suited for static sites and content-driven apps built with tools like Jekyll, Hugo, Next.js, Astro, VuePress, and similar stacks.

You can use the hosted version directly at [app.pagescms.org](https://app.pagescms.org), or run your own local development copy from this repository.

[![Screenshot of the Pages CMS editor](https://pagescms.org/media/screenshot.png)](https://demo.pagescms.org)

*[Watch the demo ▶](https://demo.pagescms.org)*

## Documentation

Full documentation lives at [pagescms.org/docs](https://pagescms.org/docs).

Useful starting points:

- [Install locally](https://pagescms.org/docs/guides/install-local/)
- [Create the GitHub App](https://pagescms.org/docs/guides/creating-github-app/)
- [Environment variables](https://pagescms.org/docs/guides/environment-variables/)
- [Upgrading to 2.x](https://pagescms.org/docs/guides/upgrading-to-2/)

## Use online

The easiest way to get started is the hosted version at [app.pagescms.org](https://app.pagescms.org).

Use that if you want to:

- try Pages CMS immediately,
- edit content without running anything locally,
- stay on the latest hosted version.

## Local development

### What you need

- PostgreSQL
- a GitHub App
- a local `.env.local`
- the Pages CMS repo checked out locally

### Quick start

1. Clone the repository:

```bash
git clone https://github.com/pages-cms/pages-cms.git
cd pages-cms
```

2. Start PostgreSQL locally:

```bash
docker run --name pagescms-db -e POSTGRES_USER=pagescms -e POSTGRES_PASSWORD=pagescms -e POSTGRES_DB=pagescms -p 5432:5432 -d postgres:16
```

3. Install dependencies:

```bash
npm install
```

4. Create `.env.local` with at least:

```bash
DATABASE_URL=postgresql://pagescms:pagescms@localhost:5432/pagescms
BETTER_AUTH_SECRET=your-random-secret
CRYPTO_KEY=your-random-secret
```

Generate secrets with:

```bash
openssl rand -base64 32
```

5. Create your GitHub App with the helper:

```bash
npm run setup:github-app -- --base-url http://localhost:3000
```

Useful options:

- `--owner-type personal|org`
- `--org <slug>`
- `--app-name "Pages CMS (local)"`
- `--env .env.local`
- `--no-open`

6. Run database migrations:

```bash
npm run db:migrate
```

7. Start the app:

```bash
npm run dev
```

If you need GitHub webhooks to reach your local app, use a public tunnel URL as the helper `--base-url`.

For more detail, see:

- [Install locally](https://pagescms.org/docs/guides/install-local/)
- [Create the GitHub App](https://pagescms.org/docs/guides/creating-github-app/)
- [Environment variables](https://pagescms.org/docs/guides/environment-variables/)

## Support the project

- [Contribute code](https://github.com/pages-cms/pages-cms/pulls)
- [Report issues](https://github.com/pages-cms/pages-cms/issues)
- [Sponsor me](https://github.com/sponsors/hunvreus)
- [Star the project on GitHub](https://github.com/pages-cms/pages-cms)
- [Join the Discord chat](https://pagescms.org/chat)

## License

Everything in this repo is released under the [MIT License](LICENSE).
