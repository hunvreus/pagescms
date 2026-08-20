# Plugins

Pages CMS plugins are trusted modules installed before the Vite build. They are not uploaded or executed dynamically by application users.

## Current contract

Create `plugins/<id>/plugin.ts` and default-export `definePlugin(...)`. The build discovers immediate plugin directories statically. Plugin identifiers use lowercase kebab-case and must be unique. Unsupported API versions fail the build or application startup.

The client-safe manifest contains metadata only. Optional server capabilities live in `plugins/<id>/server.ts`, which is statically discovered only by the server build. The initial server capabilities are an access-policy provider for hosted plans and granular enterprise permissions, plus a custom email provider. Field, UI-slot, and selected webhook contracts will be added separately so importing one capability never pulls every plugin dependency into both bundles.

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

An email plugin implements the small `EmailProvider.send(message)` contract and registers `emailProvider` from the same server contribution. Exactly one provider may be active. Resend, SMTP through a separate service, or a deployment-specific provider can therefore be updated independently, and unused email SDKs never enter the application bundles.

## Packaging

Private implementations should live in independent repositories or versioned private packages. A future lock/update command will install or link their thin composition files into this folder reproducibly. Updating Pages CMS remains a normal pull/rebase of the public repository; updating a proprietary plugin updates its independently versioned package. Do not commit proprietary source into the public Pages CMS repository or use a long-lived fork to compose hosted functionality.
