# Plugins

Pages CMS plugins are trusted modules installed before the Vite build. They are not uploaded or executed dynamically by application users.

## Current contract

Create `plugins/<id>/plugin.ts` and default-export `definePlugin(...)`. The build discovers immediate plugin directories statically. Plugin identifiers use lowercase kebab-case and must be unique. Unsupported API versions fail the build or application startup.

The current manifest intentionally contains metadata only. Later contracts will add separate client and server entry points for fields, email, entitlement policies, enterprise permissions, UI slots, and selected webhook handlers. A plugin will never be allowed to override a denial from core security or GitHub permissions.

## Packaging

Private implementations should live in independent repositories or versioned private packages. A future lock/update command will install them into this folder reproducibly. Do not commit proprietary source into the public Pages CMS repository or use a long-lived fork to compose hosted functionality.
