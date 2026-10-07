# Deployment composition

Pages CMS supports trusted build-time modules for optional and proprietary capabilities. We may call those modules “plugins” informally, but this is deliberately not a generic runtime plugin framework: core owns the supported boundaries, routes, validation, and lifecycle.

## Status

Deployment API version `1` is the first closed contract. It supports static
server/client selection, lazy client field editors, the named repository
permissions contribution, access policy, safe entitlement reads, the fixed
billing webhook, email, and per-context media storage/delivery resolution.

## Two explicit entry points

The build resolves two stable aliases:

- `#pagescms/deployment/server` may import secrets and server-only dependencies. It exports a factory so environment variables are validated and supplied at startup, not read during module import. Core invokes that factory once per runtime instance (for example, once per Worker isolate or Node process), and reuses the returned deployment services across requests. Those services must therefore be concurrency-safe and must not retain request, session, or user state.
- `#pagescms/deployment/client` contains only lazy client contributions and field editors. It must never import the server entry.

The public build resolves both aliases to in-tree defaults. Hosted CI resolves them to entry points in `../pagescms-pro`, or to a normal hosted-only private `file:` dependency if direct sibling source cannot satisfy Vite, TypeScript, Vitest, Wrangler, HMR, and dependency-deduplication checks. Private code is never copied or generated into the public checkout.

Select an alternate composition by setting both entries together:

```sh
PAGESCMS_DEPLOYMENT_SERVER=../pagescms-pro/deployment.server.ts \
PAGESCMS_DEPLOYMENT_CLIENT=../pagescms-pro/deployment-client.ts \
pnpm build
```

Setting only one entry fails configuration. Paths may be repository-relative
or absolute environment values; absolute paths must never be committed. Vite
allows the selected sibling directories during development and deduplicates
React, React DOM, TanStack Query, and TanStack Router so a sibling checkout does
not create a second runtime singleton.

Illustrative closed shapes:

```ts
interface PagesCmsServerDeployment {
  apiVersion: 2
  create(runtime: RuntimeConfiguration): {
    accessPolicy?: AccessPolicy
    emailProvider?: EmailProvider
    mediaProviderResolver?: {
      resolveStorage(context: MediaContext): MediaStorage
      resolveDelivery(context: MediaContext): MediaDelivery
    }
  }
}

interface PagesCmsClientDeployment {
  apiVersion: 2
  fieldEditors?: Record<string, LazyFieldEditor>
  ui?: {
    repositoryPermissions?: LazyUiContribution<RepositoryCollaboratorsProps>
  }
}
```

`definePagesCmsServerDeployment` and `definePagesCmsClientDeployment` validate closed objects and preserve inference. They do not register callbacks, discover directories, infer a plugin category, or expose an unordered hook bag.

The media resolver may replace storage, delivery, or both for one repository/media context. Core still validates configured roots and extensions, confines provider output to requested paths, and routes reads and mutations through the selected storage. Directory manifests contain stable metadata only. Browser URLs are separate delivery leases and are never stored in the directory cache or dehydrated through SSR.

## How a module is used

A module has no self-declared “type.” The deployment composition assigns a concrete implementation to a named application boundary:

```ts
export default definePagesCmsServerDeployment({
  apiVersion: 2,
  create(runtime) {
    return {
      accessPolicy: createHostedAccessPolicy(runtime.billing),
      emailProvider: createHostedEmailProvider(runtime.email),
      mediaProviderResolver: {
        resolveStorage: createStorageResolver({ github, s3 }),
        resolveDelivery: createDeliveryResolver({ direct, cloudflare }),
      },
    }
  },
})
```

Billing, granular permissions, S3 storage, and Cloudflare delivery remain separate private modules even when one hosted deployment wires them together. The hosted policy may coordinate billing entitlements and permissions internally, but core receives one deterministic `AccessPolicy`; a generic `composePolicies()` helper would obscure denial precedence and transactional quota behavior.

## Supported boundaries

| Boundary                    | Purpose                                                                                            | Initial rule                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `AccessPolicy`              | Authoritative protected-operation decisions, discovery filtering, and quota reservation/settlement | OSS uses an explicit allow policy; hosted billing and permissions expose one policy |
| `EntitlementReader`         | Non-authoritative plan/usage display state                                                         | Returns a closed safe projection; vendor IDs and raw provider state are forbidden   |
| Media storage resolver      | Selects GitHub or S3 per tenant/repository/context                                                 | GitHub is always the OSS fallback                                                   |
| Media delivery resolver     | Sole issuer of browser URLs/leases                                                                 | Direct GitHub delivery is the portable default; Cloudflare acceleration is optional |
| `EmailProvider`             | Transactional server email                                                                         | HTTP provider with no SMTP requirement in the Worker                                |
| `BillingSessions`           | Authenticated checkout and customer portal session creation                                        | Server-owned identity and return URL                                                |
| `BillingWebhookHandler`     | Provider-specific verification and reconciliation behind one fixed core route                      | Receives untouched raw bytes and signature headers                                  |
| Field registries            | Server metadata plus separately imported lazy client components                                    | `.pages.yml` names configured symbols, never arbitrary module paths                 |
| `RepositoryPermissionAdmin` | Server CRUD for repository roles, permissions and assignments                                      | Required before the paired named client contribution may render                     |
| Named UI contributions      | Route-specific, non-authoritative lazy UI                                                          | Repository permissions only initially; billing UI remains core-owned                |

Pages CMS does not initially support arbitrary middleware, arbitrary route injection, route replacement, catch-all webhooks, mutation interception, universal DOM slots, or runtime-installed code. A new boundary needs a concrete product requirement, authority model, lifecycle, failure policy, and conformance suite.

## Access and billing lifecycle

Every server function, route, webhook, job, and command must either map to the normative operation catalog through the core policy gateway or appear in a narrow reviewed public allowlist. GitHub/collaborator membership establishes base admission; hosted policy may only narrow it. Read-only requests use authorization/discovery. Quota-consuming mutations use this gateway-owned lifecycle:

```text
authenticate -> base admission -> reserve(idempotency key)
-> perform operation -> settle(committed | released)
```

Hosted policy outages fail closed for gated operations while sign-in, session identity, billing recovery, support contact, and health remain available. Core-owned billing UI consumes an `EntitlementSnapshot`; it never authorizes an action.

The billing webhook route reads `request.arrayBuffer()` exactly once and delegates the untouched bytes. The private handler verifies signatures before parsing trusted semantics, deduplicates events, and reconciles state transactionally.

## Media lifecycle

Storage and delivery are separate authorities. Storage lists assets, mutates them, and returns server-only origins. Exactly one selected delivery implementation converts origins into ephemeral browser leases. Storage never mints public client URLs and delivery never chooses the storage provider.

The OSS resolver always selects GitHub storage and direct delivery. Hosted resolution may select S3 storage and/or Cloudflare delivery per context. Repository content stores portable paths or URLs, never provider credentials, S3 objects, or delivery leases.

S3 uploads use constrained presigned POST policies for small objects and multipart presigning above an approved threshold. The storage binds an opaque signed upload ticket and the core quota reservation to immutable S3 metadata. A core confirmation endpoint checks that metadata and the object version before quota settlement. Transfer failures abort and release the reservation; settlement and confirmation use bounded idempotent retries, and confirmation failures preserve the completed object for a later retry. Bucket lifecycle rules clean clients that disappear. CORS must allow the application origins, `POST`/`PUT`, request headers used by the signed operation, and expose `ETag` for multipart completion. Cloudflare delivery runs as a separately deployed Worker/hostname with short-lived signed capabilities and current/previous key rotation; it improves the baseline but is not required for Node, Vercel, or self-hosted correctness.

## Trusted custom fields

Custom field code is installed at build time. The server registry owns validation and serialization metadata; the client registry owns the lazy editor/view implementation. `.pages.yml` may select a known symbol but cannot import code. Startup validation rejects missing or mismatched server/client registrations.

## Private repository and release flow

```text
../pagescms-pro/
  package.json
  deployment.server.ts
  deployment-client.ts
  pagescms.compat.json
  wrangler.hosted.jsonc
  plugins/
    billing/
    permissions/
    media-s3/
    media-cloudflare/
  database/
    schema.ts
    migrations/
  tests/
    contract/
    integration/
```

The repositories are independently versioned. Pull/rebase Pages CMS normally, pull `../pagescms-pro` separately, then run the compatibility and contract/build matrices. Public migrations run before private migrations; rollback reverses that order. Private tables initially reference public records by stable identifiers without cross-repository foreign keys. Public migration discovery never scans sibling paths.

## Required validation

CI must cover:

- a public build with `../pagescms-pro` absent;
- a fixture-composed public build using `tests/deployment/fake-pro/`;
- private CI against every supported public version;
- contract tests for denial/no-side-effect behavior, quota reservation/settlement, media capabilities, webhook idempotency, and client-safe projections;
- browser tests for named UI presence and absence;
- bundle inspection proving private code is absent from OSS output and server-only dependencies are absent from browser chunks;
- public and hosted Cloudflare Workers dry-runs;
- private migration and provider integration tests.

The composition spike must additionally prove sibling HMR, singleton dependency deduplication, TypeScript/Vitest/Vite resolver agreement, private Drizzle migration ownership, and Workers bundle isolation before `../pagescms-pro` becomes the production integration path.

The `repositoryPermissions` client contribution owns the full collaborator UI:
core passes collaborators, branch names, configuration resources, the permission
state and server-backed invite/remove/replace callbacks. Core renders its basic
component only when that contribution is absent. The contribution does not append
an assignment table to core's existing table.
