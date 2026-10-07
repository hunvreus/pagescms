# Changelog

- Let hosted deployments replace collaborator management with one table and a combined role/branch invitation flow; persist invitation access before granting core membership.

## Pro SQLite overhaul (unreleased)

- Deployment API v2 adds authenticated billing sessions and database role contracts.
- Pro uses separate SQLite/Drizzle migrations, with D1 and libSQL/Turso support.
- Remove the unused repository-permission cache table and Settings control.
- Enforce named content permissions for fixed files, separate action run/log/cancel/rerun capabilities, and configured collaborator branch navigation.
- New collaborator invitations default to repository-wide access; Pro controls roles and optional branch scope.

## Unreleased

### Tests

- Remove tests that mirror styling and synthetic payload ratios; preserve behavior, persistence, keyboard, loading and layout coverage.
- Give each browser test independent database/cache/GitHub fixture state and update branch/configuration expectations.
- Add OTP/session HTTP and authenticated billing-handler coverage; run database, composition and production media checks in CI.

### Fixed

- Preserve configuration diagnostics when CodeMirror reconfigures its editor extensions.

- Kept configuration preview and editing heights consistent and used a compact single-line empty Actions row in Settings.

- Made avatar images, fallbacks, and borders inherit the root corner shape everywhere, and showed an Actions Empty state for unconfigured repositories.

- Matched avatar borders to custom corner shapes during loading and kept unconfigured repository Settings from loading configuration-dependent Actions.

- Moved repository Settings exclusively into the dropdown, restored Settings/branch icons, and kept the GitHub separator conditional on direct GitHub access.

- Simplified repository dropdown labels, used the shadcn CommandDialog branch picker with branch creation at the bottom, and linked the unconfigured Empty state directly to configuration editing.

- Ordered repository menu shortcuts as View on GitHub, Settings, and branch selection without intervening dividers, aligning the iconless source link with icon-labelled items.
- Repository dropdown selections close before navigation completes. Restored searchable full branch management, with a five-branch submenu (current/default first), conditional Settings/GitHub links, and an All projects arrow.
- Split entry loading skeletons and field predicates away from heavy editor/media code; projected collection list payloads without dropping view-required fields; replaced oversized template PNG delivery with resized WebP thumbnails.
- Removed profile synchronization from session reads, bounded credential-scoped negative GitHub lookups, deferred branch enumeration to the picker, throttled repository activity writes, and replaced collaborator installation scans with targeted App lookups when configured.
- Streamed conditional GitHub media previews after authorization and added production client bundle/thumbnail budgets to both build targets.

- Required verified OAuth emails and verified admin/pending-collaborator email matches; blocked collaborator configuration writes and workflow mutations server-side; checked destination-branch admission; isolated media previews with sandbox CSP and safe errors; made invitation reads pure and invitation lifecycle/revocation changes atomic.

- Set large media-grid folder/file placeholder strokes to a fixed two pixels without changing small control icons.

- Routed editor and collection breadcrumbs through TanStack links with global intent prefetching, removed muted populated table values, and replaced entry-history loading text with three matching skeleton rows.

- Moved GitHub-only repository settings to the end of sidebar navigation without a section label and removed the controls above the repository selector.

- Restored neutral registry border/ring focus styling for Select triggers without changing other controls.

- Muted list expand/collapse-all controls until hover.

- Muted repository header navigation with a labelled settings button, aligned editor image preview corners with fields, clarified block reset controls, and added branch-aware source links with faded arrows to editor and collection menus.

- Restored the green Pages CMS logo and moved repository navigation and GitHub-only settings controls above the repository switcher.

- Restored distinct block-removal X controls and labels, separate from list-item trash controls, with specific file and image removal tooltips.

- Kept sortable list, file, and image items opaque and at their original size while moving, without a drag overlay.

- Aligned selected file rows with list controls, restored file-type icons, displayed media-relative paths, and linked filenames to the current GitHub branch only for users with repository access.

- Kept list collapse buttons transparent when expanded and restored standard button text sizing without changing their compact height.

- Added tooltips to list item and block remove buttons.

- Matched list collapse triggers to the small ghost buttons, removed header control gaps, and muted drag/remove controls until hover.

- Aligned list expand/collapse controls with their field labels and adopted registry Nova Tabs styling for Editor/Source switches while retaining their compact height.

- Unified ProseMirror model resolution and deduplicated its Tiptap entry point to prevent swallowed input and Fragment errors after switching Source/Editor modes. Isolated the browser-test dependency cache from the running development server.

### Added

- TanStack Start application at the repository root with typed routes, intent preloading, TanStack Query caching, pending skeletons, and a Cloudflare Workers production target.
- Legacy-compatible configuration, serialization, GitHub/database adapters, authentication, repository navigation, editors, media, actions, collaborators, cache controls, settings, administration, and signed webhook invalidation.
- Trusted build-time plugins for hosted access policy, email delivery, and custom client fields without maintaining a fork.
- Closed deployment contracts for hosted entitlements, billing webhooks, repository-permission administration, and per-repository media storage/delivery selection.
- Typed paid-plan, quota, permission, and policy-unavailable errors with safe plugin-provided upgrade links.
- Shared full-page and embedded media browsers with responsive grid/list layouts, folders-first navigation, drag upload and move, folder creation, rename/delete operations, private previews, and batched delivery leases.
- Lazy rich-text Markdown/HTML editing with embedded media browsing, upload, private previews, and repository/public path round-tripping.
- Shared CodeMirror editing for code fields and configuration, with YAML, JavaScript/TypeScript, JSON, HTML, Markdown/MDX, lazily loaded fenced-code languages, and configuration diagnostics.
- Vitest coverage and Playwright guest/health smoke coverage.

### Changed

- Admin repository inventory shows relative Last opened times with full timezone-bearing timestamps in tooltips.
- Admin repository tables omit the Forge column; opening a repository still uses normal repository access checks.
- Landing-page repository search retains existing results during filtering, uses an inline spinner, and preserves previous results when requests fail; skeletons are limited to initial loading.
- Admin filtering swaps search icons for spinners through debounce/loading, retains previous rows on loading or failure, marks tables busy, and announces result counts.
- Admin Users/Repositories footers appear only with multiple pages, showing the visible range and total in the same 0.8rem size as the Previous/Next buttons.
- Admin tables filter as you type using registry Input Group search controls matched to small buttons; repository Content cache uses separate file/directory badges like global administration.
- Global Admin settings now has searchable Users/Repositories tables and scoped Cache controls with destructive Alert Dialog confirmations. A persistent inventory tracks opened repositories independently of cache.

- Action-list metadata shows only the workflow filename without a prefix; standardized GitHub links on normal text/arrows and separated external GitHub links from local dropdown actions.

- Aligned editor-header action buttons with Save's default size; separated Save/Edit from their outline vertical-ellipsis menus, keeping collection-row controls small.

- Settings actions group Run with a vertical-ellipsis menu for GitHub workflow links and action-filtered runs. A section-level View runs opens all runs, with search, action filtering, pagination, and a stable scrolling dialog during loading.

- Repository caching is always on; removed the configuration cache toggle. Cache controls are always available to direct GitHub users with repository write access, and empty-cache Clear buttons stay visible but disabled.

- Removed the cached-directories inspector and its detailed server payload. Cache badges sit beside row titles; Configuration shows relative last-check time with the full local timestamp and timezone in a tooltip.

- Cache Clear and Clear all controls use small destructive buttons; Refresh remains outline and confirmations are unchanged.

- Made table/list empty rows compact and restricted repository GitHub links to direct user access on the current view. Configuration links now open .pages.yml on the current branch.
- Moved the app mark and favicon to blue, retaining neutral primary buttons and title-only Settings section headers.

- Configuration's GitHub link opens `.pages.yml` on the current branch; the read-only preview border matches the settings lists, while editing retains the input border.

- Standardized Settings actions on small outline buttons and table actions on small controls, with a destructive Remove button for collaborators. Removed extra vertical padding from image/action cells and grouped Edit/Save with downward-chevron menu triggers.

- Aligned global administration with the compact repository Settings layout, corrected configuration text alignment, and styled its GitHub history link as a muted ghost control.

- Simplified inline configuration to one field with a matching loading skeleton, automatic edit focus, an `edit=configuration` URL, and a direct GitHub history link instead of a history dialog. Editing grows with the document while the preview stays fixed-height; diagnostics remain inline without a duplicate error list, and History uses a trailing external-link icon with the registry's icon padding adjustment.

- Moved configuration into Settings as a faded read-only preview with inline Edit/Cancel/Save controls and retained diagnostics/history; cached-directory dialogs use one themed scrolling body instead of nested table overflow.
- Restored list-item metadata and single block-header composition, retained group fields after first opening, and removed the redundant source-editor caption.
- Matched object, block, and list-field groups to settings backgrounds and borders; removed redundant inner wrappers for list items.
- Removed collection action-cell vertical padding and the Actions header label; retained right-aligned body controls.
- Unified keyboard focus across fields, buttons, dropdown/select triggers, navigation, and custom controls with one thin inset edge instead of an outer halo; retained menu highlights and invalid-field colors. Restricted this treatment to actual controls so Radix popup focus no longer adds a blue outline or removes the popup shadow.
- Standardized Settings heading gaps and row descriptions; cache metadata uses badges, and directory details open from the Content row in a dialog.
- Aligned collection/media table wrappers with Settings borders and backgrounds, muted empty-state messages, enabled app-wide antialiasing, and added a three-row Collaborators loading skeleton; matched action labels to other settings rows.
- Moved configuration History, Cancel, and Save into a persistent dialog footer; History opens a dedicated view, and Cancel retains unsaved-change confirmation.
- Corrected Settings dialog composition to use visible Nova titles/descriptions, muted close controls through theme styling, and transparent tables with settings-colored overflow wrappers.
- Paginated recent action runs in groups of ten with small Previous/Next controls and no search field.
- Consolidated repository administration into a narrow Settings page with grouped settings rows, collaborator tables, compact cache maintenance, and URL-addressable configuration/run dialogs; fetch workflow runs only on demand and protect unsaved configuration edits.
- Tuned table backgrounds and padding, muted text contrast, and field focus borders without the additional focus halo.
- Refreshed installed Radix Nova primitives from the official shadcn/ui registry and applied a neutral charcoal theme with layered surfaces, neutral primary buttons, and blue focus states; retained native themed table scrolling and existing editor behavior.
- Configuration now parses YAML once per validation, reports invalid/recursive aliases and conversion failures inline, and accepts warning-only saves using the same validation policy as the editor.
- Restored the legacy GitHub CodeMirror themes, gutter-free editing, styled inline diagnostics, individual unknown-property warnings, and nested configuration validation messages.
- Restored field parity: named select options and placeholders, formatted date read/write/defaults/steps, custom regex messages, schema-controlled rewrite/merge behavior, custom field registration and behavior hooks, upload rename policies, and sortable multi-file fields.
- Restored collaborator CSV export/import for SQLite/libSQL, with atomic validated imports, email-based user relinking, and case-insensitive upserts.
- Audited non-webhook legacy cache paths and restored configuration write-through, upload/move source reuse, colocated media reads, node-file enrichment reuse, configurable TTL/push limits, bounded repository-read caching and cache-coordinate preservation on renames; documented intentional differences and their rationale.
- Restored incremental directory-cache updates for GitHub pushes and CMS writes, with batched retrieval, unchanged-row preservation, revision checks, and stale-data reconciliation instead of branch-wide cache deletion.
- Restored the Pages CMS favicon and social-card metadata in the TanStack application.
- Migrated Better Auth accounts to issuer-scoped identities required by Better Auth 1.7 and refreshed eligible dependencies.
- Preserved the previous Next.js application under `_legacy/` as a frozen migration reference.
- Replaced undocumented internal client REST calls with validated TanStack server functions and shared authorization services.
- Lazy-loaded the rich-text editor and kept server-only adapters out of client bundles.
- Added isolated authenticated browser coverage for repository navigation and structured content updates.
- Added media lifecycle conformance coverage, request-count/performance regression coverage, and full-page plus embedded-picker browser workflows.
- Separated ordinary Node/Vite development and builds from explicit Cloudflare build, preview, compatibility, and deployment commands.
- Made Node development and Drizzle commands load the ignored local `.env.local` file consistently.
- Unified local and deployed application services around standard environment variables, removed detached request work, and made route loaders preload feature-owned TanStack Query definitions with targeted mutation invalidation.
- Rebuilt collection views around TanStack Table and stock shadcn/ui primitives, including configuration-driven columns, search, sorting, pagination, tree expansion, dated defaults, and entry actions.
- Added an environment switch for disabling the TanStack development plugin and in-page debug panel.
- Coalesced media directory requests across collection and media consumers, retained stale browser data during refresh, and isolated performance fixtures from concurrent mutation tests.
- Added idempotent quota reservation/settlement, bounded settlement and confirmation retries, staged direct uploads, and audited expiry of abandoned hosted reservations.
- Restored the branded sign-in, collaborator invitation, and existing-collaborator notification email templates with shared HTML styling and plain-text fallbacks.
- Restored the six-slot OTP sign-in control and full-width resend and alternate-sign-in actions from the legacy authentication flow.
- Standardized validation, operation, and route error presentation around semantic shadcn/ui states, with safe authentication fallbacks instead of raw infrastructure errors.
- Made the health endpoint verify PostgreSQL readiness and return a structured `503` response while the database is unavailable.
