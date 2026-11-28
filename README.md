# Pages CMS

Pages CMS lets editors manage a GitHub repository through a web interface. Content stays in Markdown, YAML, JSON and other project files. A `.pages.yml` file describes the collections, editable fields, media libraries and translations. Saving an edit creates a Git commit. Start with the [quick start](docs/public/quick-start.md) or the [configuration reference](docs/public/reference.md).

Version 3 is in beta. The React app and Hono API run on Node.js and Cloudflare Workers. Vercel and Netlify adapters are experimental.

## Install

```sh
npm create pagescms@beta -- my-cms
cd my-cms
```

Choose a deployment target and follow the prompts to install dependencies, register your GitHub App and initialize the database. See the [self-hosting guide](docs/public/self-hosting/index.md).

## Develop from source

Use Node.js 22.19 or newer and pnpm 10. From a version 3 checkout:

```sh
pnpm install
cp .env.example .env.local
pnpm setup:github-app
```

Choose **Local development** and supply a public webhook URL that forwards to `http://localhost:3000/api/webhook/github`. Set `BETTER_AUTH_SECRET` in `.env.local` and turn off user access token expiration in your GitHub App settings. To use the instance-wide Admin page, set `ADMIN_EMAILS` to your verified sign-in email. See [authentication and GitHub App setup](docs/development/authentication.md).

```sh
pnpm db:migrate
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The default SQLite database is `.data/pagescms.db`. The readiness endpoint at `/api/health` checks the application and cache databases. See [database setup](docs/development/database.md) for separate cache storage or remote libSQL.

## Self-hosting and upgrades

For a source checkout, `pnpm build` and `pnpm preview` build and serve the Node app. See the [Workers guide](docs/development/cloudflare.md) for the Cloudflare build and deployment commands.

Upgrading from 2.x keeps repository content and configuration in GitHub. Use a freshly migrated SQLite/D1 database and the [collaborator migration guide](docs/development/postgresql-migration.md) to transfer retained assignments from PostgreSQL. Port third-party custom fields using the [field migration guide](src/fields/custom/README.md#porting-a-version-2-field).

## Development checks

| Command                                           | What it checks                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm validate`                                   | Translations, formatting, lint, types, unit tests and Workers dry run                                                                |
| `pnpm test:integration`                           | Persistence against isolated SQLite and local D1                                                                                     |
| `pnpm test:e2e`                                   | Browser workflows with an isolated database and GitHub fixture. Install Chromium first with `pnpm exec playwright install chromium`. |
| `pnpm test:package`                               | A packed core and sample plugin installed in a separate application, including Node and local Workers builds                         |
| `pnpm reference:build` and `pnpm reference:check` | Generate and verify the public docs artifact and portable configuration reference                                                    |

## Documentation and contributing

- [Documentation index](docs/index.md) and [architecture](ARCHITECTURE.md)
- [Plugin development](docs/development/plugins.md), [webhooks and caching](docs/development/webhooks-and-cache.md) and [testing](docs/development/testing.md)
- [Compatibility](docs/development/parity.md), [changelog](CHANGELOG.md) and [open work](TODO.md)
- [Contribution and public documentation guidelines](AGENTS.md#public-documentation-authoring)

Edit public guides and navigation in `docs/public/`. The website combines the generated core and hosted documentation artifacts.
