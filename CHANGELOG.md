# Changelog

## 3.0.0 - Unreleased

Pages CMS 3.0 is a rewrite. Your `.pages.yml` and content stay as they are; the application, its runtime and its database are new. See the [upgrade guide](https://pagescms.org/docs/self-hosting/upgrading/).

### Added

- Move media files from the file menu or by dropping them onto an ancestor folder in the breadcrumb. A notification tracks each move from start to finish.

- `operations: false` disables creating, renaming, and deleting content in a collection or file.

- Collection filename templates support subfolders for Hugo page bundles and date-based archives.

- An Admin allowlist for restricting sign-up and sign-in by email, domain, or regular expression.

- **Content localization.** Translate collections and files stored either as one file per language (filename or folder rules) or as language keys inside one file. Editors switch languages, start translations blank or from another language, copy single fields, and see which translations exist.
- **Local drafts.** Unsaved edits are kept in the browser, survive reloads and closed tabs, and can be downloaded or discarded.
- **Conflict review.** When a file changed on GitHub during an edit, editors choose between versions field by field instead of overwriting.
- **Overview page** with quick links, repository activity, unsaved drafts and recently visited content.
- **Cloudflare Workers** runtime with D1, alongside Node.js.
- Experimental Vercel and Netlify project templates and deployment guides use remote libSQL and the standard plugin build and migrations.
- **Plugins.** Deployments register custom fields, server routes, sign-in and email providers, repository pages and account settings in `pagescms.config.ts`, with their own database migrations. Pages CMS can be installed as a package and managed with the `pagescms` CLI.
- `pagescms migrate --remote` applies core and registered plugin migrations to remote Cloudflare D1, including a separate cache database when configured.
- **Interface languages:** English, French, Spanish, Brazilian Portuguese and Simplified Chinese.
- Google sign-in, alongside GitHub and email codes.
- Rich-text `snippets` and `html` options to insert prepared content and choose which HTML elements stay editable.
- `icon` on collections, files and media libraries; `view.foldersFirst`; `list: true` on single files; `commit.allowCustomMessage`; and an `overview` placement for top-level actions.
- `pnpm setup:github-app` to register and configure the GitHub App.
- The project creator can guide users through dependency installation, GitHub App setup and local database migration, with each step available separately. Guided local migration checks both database URLs before applying migrations.
- `/api/health` readiness endpoint.
- Account profile, preferences and self-service account deletion.

### Changed

- File action menus open without locking the media list while browsing large images.

- Core and private plugin writes use the same public-origin policy behind proxies.

- Overview reads draft summaries and recent visits for the current account, provider, repository, and branch.
- Admin user and repository searches match literal substrings, including underscores and percent signs.

- Renaming an entry preserves conflict detection for local drafts. Structured saves preserve empty JSON objects and existing TOML date and time values. Empty GitHub files can be opened for editing.
- Admin session revocation can also revoke credentials managed by deployment plugins. HTML responses disallow framing, and the Node server revalidates the app shell after a deploy.

- Multilingual collections show entries in the selected language.
- Collection warnings identify files whose fields could not be read and can refresh the affected content.

- Collection loading uses the configured columns and the same header, row spacing and horizontal scrolling as the loaded table.
- Filtering a collection keeps matching entries and their controls mounted while you type.
- Repository breadcrumbs stay on one line and put intermediate segments in a menu when space runs short. Collection filters remain available on narrow screens, and search fields use a consistent leading icon.

- Rebuilt as a React single-page application with a Hono API, replacing the Next.js application.
- SQLite, libSQL/Turso or Cloudflare D1 replace PostgreSQL. Disposable cache data can live in a separate database.
- Repository caching follows GitHub webhooks and revision checks, so listings stay current without refetching whole branches.
- The configuration editor validates as you type, offers autocompletion, and shows errors at their source line.
- The rich-text editor has separate Editor and Source modes and keeps custom HTML and component markup intact.
- Configured icons use [Hugeicons](https://hugeicons.com) names instead of Lucide names. Unknown names fall back to a default icon.
- Custom fields are plugins, split into a shared definition and lazily loaded editor and view components. Version 2 fields need a [source port](https://pagescms.org/docs/extending/field-api/#porting-a-version-2-field).
- OAuth tokens are encrypted at rest.
- Vercel rewrites preserve application query parameters and route plugin discovery requests under `/.well-known/` to the API. Netlify and Vercel build for remote libSQL on deployment and support SQLite for local previews.
- The Node development server and source preview accept push webhooks using the same request handling as the standalone Node server.
- New interface built on shadcn/ui.
- Account display name changes are saved explicitly; profile pictures and preferences save on change.

### Fixed

- Media folders refresh against the current GitHub revision after external moves. A move or rename that finds a missing or conflicting file also refreshes the affected folders.

### Removed

- PostgreSQL support.
- The internal `/api/:owner/:repo/...` JSON routes used by the version 2 interface.
- Remote option sources, creatable options, option artwork and object-preserving reference values for `select` and `reference` fields.

### Upgrading from 2.x

Deploy 3.0 as a new instance with a fresh database and [move collaborators](https://pagescms.org/docs/self-hosting/upgrading/#2-move-collaborators) across; that's the only data to migrate. People sign in again, and the cache rebuilds itself. Open **Configuration** in each project to fix any validation messages.
