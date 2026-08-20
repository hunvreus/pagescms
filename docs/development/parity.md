# Migration parity status

The TanStack application implements every legacy user-facing route. Collection creation now opens inline; legacy `/collection/:name/new` URLs redirect into that state. Legacy `/collection/:name/edit/:path` and repository settings URLs redirect to their replacement routes.

Implemented product areas include authentication and account linking, repository/branch selection and creation, configuration/history, collection list/tree/search/sort/pagination, structured and raw content, root lists, nested fields and blocks, references, entry/file history and mutations, media browsing/upload/folders/rename/delete/private previews, actions/runs, collaborators/invitations, cache controls, settings/installations, administration, GitHub App installation, and signed webhook invalidation.

The old Next.js UI called many `/api/:owner/:repo/...` JSON routes as an internal transport. Repository history contains no public documentation or non-legacy consumer for those shapes, so the replacement intentionally uses validated TanStack server functions through the same access-policy gateway instead of maintaining two transports. The externally meaningful HTTP routes retained are Better Auth, app version, GitHub App installation, GitHub webhook, health, and authenticated media preview.

Behavioral parity is not yet release acceptance. The remaining editor polish, hosted-policy UI, authenticated browser fixtures, and deployment/cutover gates are tracked in [`TODO.md`](../../TODO.md).
