---
title: Plugins
description: Extend a self-hosted Pages CMS with fields, server routes, providers and interface additions.
---

Plugins add capabilities to a self-hosted deployment: field types, server routes, sign-in or email providers, repository pages and interface additions. They're compiled into your build from `pagescms.config.ts`. `.pages.yml` can then use what they provide, but can't install code.

## Register a plugin

```ts title="pagescms.config.ts"
import { defineConfig, definePlugin } from 'pagescms'

export default defineConfig({
  target: 'node', // or 'cloudflare'
  plugins: [
    definePlugin({
      id: 'example',
      server: new URL('./plugins/example/server.ts', import.meta.url),
      shared: new URL('./plugins/example/shared.ts', import.meta.url),
      client: new URL('./plugins/example/client.ts', import.meta.url),
      options: { region: 'eu' },
      publicOptions: { brandColor: '#ff6600' },
    }),
  ],
})
```

Include only the entry points your plugin uses. The build checks that plugin IDs are unique and compatible with the target. Restart the dev server after changes, and rebuild for production.

| Option          | Description                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`            | **Required.** Stable, unique ID. It namespaces routes and migrations, so don't change it between releases. |
| `server`        | Server module: access policies, HTTP routes, providers. Its factory receives the runtime environment.      |
| `shared`        | Field definitions used for validation on both server and browser. Must be synchronous.                     |
| `client`        | Browser module: field editors and views, repository pages, interface contributions. Loaded lazily.         |
| `options`       | Serializable build-time settings.                                                                          |
| `publicOptions` | Settings that are safe to expose to the browser.                                                           |
| `migrations`    | Path or URL to the plugin's SQLite-compatible Drizzle migration folder.                                    |

Keep credentials in environment variables, and server-only helpers in `*.server.ts` files so they never reach the browser bundle.

## Routes

Server routes are mounted under `/api/plugins/<id>/` and each declares an access level. Hiding a button in the interface doesn't protect its route: always enforce access in the route itself.

On Cloudflare, only `/api/*` and `/.well-known/*` reach the Worker by default. If a plugin serves another path, add it to `assets.run_worker_first` in `wrangler.jsonc`:

```jsonc
"assets": {
  "run_worker_first": ["/api/*", "/.well-known/*", "/mcp"]
}
```

## Database migrations

Set `migrations` to a folder of SQLite-compatible Drizzle migrations. Generate them with `drizzle-kit generate`, using `dialect: 'sqlite'`, the plugin's schema as `schema` and that folder as `out`.

`npm run migrate` applies core migrations, then each plugin's, tracked separately by plugin ID. On Cloudflare, use `npm run migrate:remote` for the deployed database.

## Next

- [Create a custom field](/docs/extending/custom-field/), a complete walkthrough
- [Custom field API](/docs/extending/field-api/)
