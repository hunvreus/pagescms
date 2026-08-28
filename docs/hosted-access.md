# Hosted access and entitlements

Pages CMS core owns authentication, GitHub/core collaborator admission, the
operation catalog, and the policy gateway. A hosted deployment supplies one
authoritative `AccessPolicy`; billing and granular permissions may be separate
private modules behind that policy, but they are not unordered application
hooks.

## Decision order

Repository operations follow this order:

```text
authenticate -> GitHub/core repository admission -> hosted authorize/discover
-> optional quota reserve -> protected operation -> quota settlement
```

The hosted policy can narrow established repository access. It cannot grant
access that GitHub or core collaborator membership denied. Client visibility is
only a projection; direct URLs and every mutation authorize again on the
server.

Self-hosted deployments use the named allow-all policy. Hosted startup fails if
its required policy is missing. Policy/provider errors fail closed for
protected work. Health, authentication, account recovery, and billing recovery
remain available.

## Discovery and repository permissions

Discovery evaluates all configured collections, media sources, and actions in
one request. It returns `all`, `none`, or an explicit filtered resource list,
avoiding an authorization N+1. The repository workspace removes hidden schemas
and actions from the client configuration projection. Action-list responses are
filtered the same way. Files remain repository-scoped in deployment API v1.

Granular snapshots are opt-in per repository: version `0` preserves existing
collaborator behavior. Once an owner saves a snapshot, a collaborator needs an
exact operation/resource grant. Repository-level grants apply to every named
resource. Collaborators can never read or replace their own permission
snapshot through the permission-administration API.

## Quotas

Quota-consuming commands use an idempotency key and the gateway-owned
`reserve -> settle(committed|released)` lifecycle. A denied reservation never
runs the protected operation. Concurrent reservations for one tenant/key are
serialized by the hosted store, retries return the same reservation, and
settlement is exactly-once.

Core currently supplies consumption facts for repository creation and media
uploads. Those counters represent committed mutations, not current inventory:

- `repositories`: repositories created through Pages CMS;
- `mediaBytes`: bytes uploaded through Pages CMS;
- `mediaObjects`: uploads used when an exact byte count is unavailable.

Deployments must leave limits unset unless that consumption model matches the
product being sold. A current repository-count or storage-usage product needs a
provider-specific inventory/deletion/reconciliation lifecycle; labels must not
misrepresent cumulative counters as current storage.

Direct object uploads reserve before presigning and stage unconfirmed bytes
outside normal media listings. Confirmation verifies ticket-bound metadata,
promotes the object, and commits the reservation. Transfer failures abort and
release it. Settlement and confirmation use bounded idempotent retries;
confirmation failures preserve provider state so the same confirmation can be
retried safely. Hosted reservations expire after a configurable TTL so
abandoned clients cannot block quota indefinitely; expiry is audited.
Storage lifecycle rules remain the final safeguard for staged objects and
multipart sessions.

## Entitlement projection and billing

`EntitlementReader` returns only normalized status, plan label, policy version,
usage counters, and safe upgrade/portal URLs. Provider customer IDs, price IDs,
raw events, and secrets are forbidden from the client projection.

The core billing route passes exact raw request bytes and headers to the fixed
private handler. The handler must verify the provider signature before parsing,
deduplicate event IDs, order updates transactionally, and record uncertain
ordering for reconciliation. Invalid signatures and payloads return bounded
400/401 responses rather than exposing provider errors.

Manual support overrides are private operations. They require an actor, reason,
explicit tenant, and optional expiry; setting and clearing them increments the
policy version and writes an audit record. The public application exposes no
generic support or billing hook.

## Safe denial reasons

Core surfaces only the closed reasons `authentication_required`,
`permission_denied`, `plan_required`, `quota_exceeded`,
`feature_unavailable`, and `policy_unavailable`, plus a safe upgrade URL where
applicable. Vendor state and payment details stay out of general errors and
logs.
