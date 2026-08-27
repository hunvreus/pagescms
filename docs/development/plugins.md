# Plugins

Pages CMS plugins are trusted modules installed before the Vite build. They are not uploaded or executed dynamically by application users.

## Current contract

Create `plugins/<id>/plugin.ts` and default-export `definePlugin(...)`. The build discovers immediate plugin directories statically. Plugin identifiers use lowercase kebab-case and must be unique. Unsupported API versions fail the build or application startup.

The client-safe manifest contains metadata only. Optional server capabilities live in `plugins/<id>/server.ts`, which is statically discovered only by the server build. The current server capabilities are an access-policy provider for hosted plans and granular enterprise permissions, plus a custom email provider. Optional custom editor fields live in `plugins/<id>/client.ts` and are discovered only by the application client.

```ts
import { defineServerPlugin } from '#/plugins/server-contract.server'

import { hostedAccessPolicy } from './hosted-access-policy.server'

export default defineServerPlugin({
  apiVersion: 1,
  pluginId: 'enterprise-access',
  accessPolicy: hostedAccessPolicy,
})
```

Exactly one plugin may provide the deployment access policy. A server contribution without a matching manifest, an incompatible API version, or multiple policy providers fails startup. Hosted mode also fails startup when no policy is registered; ordinary self-hosting uses the explicit core allow-all policy. A plugin can never replace GitHub authorization, override core content-operation restrictions, or authorize from client-side state.

An email plugin implements the small `EmailProvider.send(message)` contract and registers `createEmailProvider(environment)` from the same server contribution. The factory returns `undefined` when its configuration is absent, so the corresponding sign-in method is not shown. Exactly one provider factory may be installed. The bundled Resend plugin uses the HTTP API without an SDK; it can be removed in favor of SMTP through a separate service or another deployment-specific provider.

A client field plugin registers components by the `component` name used in `.pages.yml`:

```tsx
import { defineClientPlugin } from '#/plugins/client-contract'

export default defineClientPlugin({
  apiVersion: 1,
  pluginId: 'brand-fields',
  fields: {
    color: ({ value, disabled, onChange }) => (
      <input
        type="color"
        disabled={disabled}
        value={typeof value === 'string' ? value : '#000000'}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
  },
})
```

The `pluginId` must match an installed manifest. Duplicate field names and incompatible API versions fail startup. These plugins are trusted application code: update dependencies, review changes, and rebuild the app after changing them.

## Packaging

Private implementations should live in independent repositories or versioned private packages. Updating Pages CMS remains a normal pull/rebase of the public repository; updating a proprietary plugin updates its independently versioned package and the thin composition files under `plugins/`. Reinstall dependencies if its package version changed, then rebuild. Do not commit proprietary source into the public Pages CMS repository or use a long-lived fork to compose hosted functionality.
