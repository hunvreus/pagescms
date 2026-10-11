# Migration parity status

The TanStack application implements every legacy user-facing route. Collection creation now opens inline; legacy `/collection/:name/new` URLs redirect into that state. Legacy `/collection/:name/edit/:path` URLs redirect to their replacement routes. Repository Configuration, Collaborators, Actions, and Cache each have a dedicated page under Admin.

Implemented product areas include authentication and account linking, repository/branch selection and creation, configuration/history, collection list/tree/search/sort/pagination, structured and raw content, root lists, nested fields and blocks, references, entry/file history and mutations, media browsing/upload/folders/rename/delete/private previews, actions/runs, collaborators/invitations, cache controls, settings/installations, administration, GitHub App installation, and signed webhook invalidation.

The repository dropdown closes at selection, before routed navigation completes. View on GitHub is followed by a separator and the branch submenu. Administration links live in the sidebar's Admin block and are hidden for invitation-backed access. A branch submenu shows up to five branches, prioritizing current/default branches and then GitHub's listing order. A small spinner in its trigger indicates fetching while known branches remain selectable. Manage branches searches the complete paginated list and permits GitHub users to create a valid, non-existing branch from the current branch; server permissions still govern creation and navigation. The legacy branch listing did not include latest-commit timestamps or latest-edit ordering.

The old Next.js UI called many `/api/:owner/:repo/...` JSON routes as an internal transport. Repository history contains no public documentation or non-legacy consumer for those shapes, so the replacement intentionally uses validated TanStack server functions through the same access-policy gateway instead of maintaining two transports. The externally meaningful HTTP routes retained are Better Auth, app version, GitHub App installation, GitHub webhook, health, and authenticated media preview.

Configuration shares the content editor layout and history menu. Rename remains available only for collection entries; fixed files cannot be renamed and configuration cannot be renamed or deleted. Actions shows tracked runs with search and manual refresh, with workflow selection in a header Run menu. Core and Pro collaborators use one searchable collaborator table with invitation controls in the header.

Configuration uses the same source validator in the editor and on save: errors block saving, unknown-property warnings do not. Raw YAML is preserved, including warning-only properties; those properties do not become supported settings. Invalid, recursive, and excessively expanded YAML aliases produce diagnostics rather than escaping into the page error boundary.

Behavioral parity is not yet release acceptance. The remaining hosted acceptance, performance measurement, and deployment/cutover gates are tracked in [`TODO.md`](../../TODO.md).

The branch submenu shows up to five branches (current, default, then others). All branches opens a searchable command dialog; Create branch opens a separate form using the current branch as its source.

## Mutation notifications

Completed writes use one concise Sonner success notification; validation and operation failures remain inline. Navigation, filters, search and ordinary data refreshes do not show success notifications. Action notifications confirm a run, rerun or cancellation request rather than workflow completion.

Media uploads use one notification per batch, updated with the current file number and the confirmed upload count. Uploads stop at the first failure; successfully uploaded files remain available and selected, and the failed batch notification can be dismissed. The Upload control is disabled and labelled Uploading while the batch runs. Rich-text image placeholders never enter persisted Markdown or HTML as temporary blob URLs; a failed preview does not discard a successfully uploaded permanent URL.

Collaborator invitations use one expanding email textarea for a single address or a comma, semicolon, whitespace or newline separated list. Enter submits; Shift+Enter inserts a new line. Every address is validated and duplicate addresses are normalized case-insensitively. Core and Pro share the email input and validation rules.

Actions triggered through the UI use a persistent notification that follows queued, running and final states across navigation. While the tab is visible, one batched status request every 15 seconds serves those notifications and any open Actions table with active runs. Automatic updates retain table rows without a search spinner. Tracking stops when runs finish; hidden tabs pause and refresh on return. Workflow webhooks update stored statuses. Missing GitHub run IDs are discovered at most every 30 seconds per run; known runs have a recovery check at most every two minutes, leased in the database across Workers. Routine checks read stored statuses and retain repository/Pro action permissions.
