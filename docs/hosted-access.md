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
filtered the same way. Fixed-file content participates in the same named-resource
checks as collections in deployment API v2.

Pro stores roles, resource permissions and user-role assignments in its SQLite
database. Resource names refer to the branch's configuration; missing references
are shown as warning badges. Multiple roles union their grants. `all` is shorthand
for all resources of a type or all operations for that resource type. Assigned
branches are `all` or a list; the role list is shared across those branches.

With no custom roles, collaborators retain basic access. If roles are defined,
unassigned collaborators are denied. Missing/deleted assigned roles grant nothing.
The built-in `full-access` role covers configured content/media/actions; it never
grants management. Only GitHub users with write access can edit configuration,
manage collaborators, clear cache or edit permission policy.

Collaborators only navigate configured, authorized branches. An unavailable
requested branch falls back to the configured default or the first authorized
configured branch. With none available, the app asks the user to contact the
administrator and links back to projects. Invalid configuration stays diagnostic.
New core invitations are repository-wide; existing branch-scoped records keep
their scope until changed. Pro assignments can narrow core admission further.
Ordinary navigation checks only the requested configured branch. The picker and
fallback reuse one repository admission and batch branch permissions, then check
configuration on authorized candidates. Cold configuration discovery still
requires a lookup for each candidate; this is not a production latency claim.

Rename/move stays within the configured content or media root. Action run, viewing
runs, cancellation and rerun use separate operations. Installation-token action
execution is enabled only with the private permission module and after policy
checks; core-only collaborators cannot dispatch workflows.

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
usage counters, and safe upgrade/portal URLs. Provider customer IDs, raw events, and secrets are forbidden from the client
projection. The separate `BillingSessions` boundary lists purchasable plan IDs and
creates authenticated checkout/portal sessions. It takes the account ID and email
from the server session; the browser cannot select another account or return URL.

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

## Collaborator UI composition

Core renders basic collaborator management. Pro's client contribution replaces
that component with a Roles section and one collaborator table. Invitations and
edits select roles and branch scope in the same dialog; pending invitations can
be edited before acceptance. No separate assignment table is shown.

Core validates invitations and checks manager access before asking Pro to save
access. Pro saves assignments before core creates membership or sends mail;
failure never creates an unscoped collaborator. Assignment keys use the normalized
invited email from the core collaborator record, not a browser-supplied identity.
That key remains stable when a pending invite binds to a user or the user changes
their account email. Existing user-ID assignments remain readable until edited.
Orphan assignments after failed delivery have no effect without core membership
and are replaced by a fresh invitation. Separate databases do not share a transaction.
