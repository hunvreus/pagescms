# Changelog

- Let hosted deployments replace collaborator management with one table and a combined role/branch invitation flow; persist invitation access before granting core membership.

## Pro SQLite overhaul (unreleased)

- Deployment API v2 adds authenticated billing sessions and database role contracts.
- Pro uses separate SQLite/Drizzle migrations, with D1 and libSQL/Turso support.
- Remove the unused repository-permission cache table and Settings control.
- Enforce named content permissions for fixed files, separate action run/log/cancel/rerun capabilities, and configured collaborator branch navigation.
- New collaborator invitations default to repository-wide access; Pro controls roles and optional branch scope.

## Unreleased

- Cache file pagination reuses cached configuration instead of forcing a GitHub configuration refresh on every page; visited result pages remain fresh for 30 seconds. Repository access checks remain enforced.

### Added

- Optional Google sign-in using a separate OAuth client per environment, verified email checks, and existing repository authorization.

- Three-way local draft review after GitHub save conflicts, with nested field choices, conservative whole-list handling, desktop/mobile layouts, and direct saving of reviewed choices with stale-write checks and retryable draft recovery.
- Show the local draft’s age beside Save in a ghost button; clicking it opens a shadcn popover with save details and a Discard draft action, including for invalid content.

- Configurable Lucide icons for collection/file navigation and Overview shortcuts, using local lazy loading with default fallbacks.
- Overview shortcuts for editing configured fixed files alongside collection creation.

- A compact repository Overview with resumable local drafts, recently opened entries, and create shortcuts.

- Persistent local content drafts for existing and new entries, with reload recovery and original file SHA conflict protection.

- Rich-text definition lists support visual term/description editing and nested lists in HTML and Markdown, using `html.keep: [dl]` and existing typography.

- Rich-text `options.snippets` exposes reusable source snippets through the shared editor slash menu, with optional HTML/Markdown input format, ordinary sanitization and filtering, and undo.

- Rich-text fields render static SVG icons in HTML and Markdown by default. The shared editor sanitizes SVG drawing elements and attributes, blocks active SVG and external references, and supports fragment source editing.

- Rich-text `options.html` forwards CSS-selector keep/strip/drop rules and attribute permissions to the shared editor. Permitted containers are editable and round-trip as HTML inside Markdown; source items preserve Markdown comments and component markup. HTML input and clipboard content are sanitized.

### Changed

- Match read-only conflict input and textarea backgrounds to the rich-text preview; keep selection dimming on the whole unselected field.

- Keep collection skeleton rows from highlighting on hover, matching other loading tables.

- Show the mobile repository toolbar’s bottom border only after scrolling, including its loading state, matching page headers.

- Use a labelled input and rich-text skeleton during entry loading, local draft lookup, and source-editor loading; match editor label heights, control sizes and field spacing, and show the same placeholders for new entries. Show ten rows while loading cached files.

- Remove decorative icons from empty-state messages and their actions; label the missing-page link “Return home”.

- Rework conflict review with plain copy, labelled read-only field comparisons, registry shadcn radios beside each field, dimmed unselected previews without card borders or selection backgrounds, sticky version headings aligned with the full column’s left edge, an inset header separator, and “Use all my changes” at the right edge of the “Your changes” column header on desktop. Align desktop version headings and mobile version labels with the radio/option’s left edge, keeping field controls inset on shared grid tracks. Ignore ProseMirror cursor widgets in first-content spacing rules so activating a Markdown label cannot add a leading-image gap. Save reviewed choices directly while preserving non-conflicting changes. Use standard dialog typography and cap its width at twice the editor maximum, centered in the visible viewport when zoomed or panned. Remove the original-value disclosure and provider-specific comparison labels.

- Place editor History after Save, group History and the entry menu as outline buttons in content and configuration editors.

- Consolidate known file-change commits into `cache_file.commitSha`, remove the redundant `changeCommitSha` column while preserving known commit/date pairs, and label these correctly in the cache viewer. Directory snapshot revisions remain in metadata.

- Move routine local-draft feedback beside Save/Create entry; retain recovery errors above the form and clear saved acknowledgements when typing resumes.

- Retain 50 local recent-entry records per user/provider/repository/branch and display 10 without pruning drafts.
- Separate cache refresh time from genuine Git commit dates; preserve known per-file commit provenance through unchanged refreshes without additional GitHub requests.

- Bind pending content and configuration writes to their originating account before and after local draft persistence, and recheck account identity before delayed completion effects.
- Prevent completed branch creation from redirecting through an unmounted dialog after history navigation. Refresh media preview leases only in affected directories and release completed content-operation payloads and callbacks.

- Keep media browsing usable during upload/create/rename/move/delete requests, with pending rows, per-file upload acknowledgement and rollback that preserves unrelated changes. Preserve newer field selections during uploads and stop subsequent upload writes if the signed-in account changes.
- Preserve configuration drafts and newer edits when saving or navigating; continue workflow, branch, collaborator and cache completion handling after navigation without waiting for background refreshes.
- Guard physical file paths across content, configuration and media views, and allow closing pending workflow/branch dialogs while requests finish.

- Keep existing content editors editable and allow app navigation while saving; preserve newer edits with the confirmed file SHA. Show pending create/rename/delete changes and update confirmed caches without waiting for background collection refreshes.

- Authorize read access before returning canonical editor data from saves and creates, while preserving confirmed writes if that response cannot be read.

- Ordinary entry/media mutations skip the pre-write GitHub repository probe, with fresh collaborator authorization and guarded credential fallback.

- Restore distinct browser titles for account, repository, collection, entry, and media pages, including repository/branch context and entry or folder paths. Separate page and repository context with `-`, retaining ` | Pages CMS` as the app suffix.

- Repository Overview uses the shared sticky page header and bordered tables with single-line draft, recent-entry, and create rows.

- Restore single-file content saves and immediate media uploads; remove staged uploads, branch-wide batch commits, and server save journals.

- Paginate entry and configuration History in batches of ten, display all loaded commits in a three-row scrollable viewport, and replace the GitHub footer with See more and retry controls.

- Preserved HTML previews select on click rather than navigating; extra link attributes require configuration, apart from standard link attributes and IDs. Document the limitation on complex MDX expressions.

- Show a separator below the sidebar repository selector while navigation is scrolled down; hide it again at the top.

- Preserve isolated browser-test repository state across Vite server-module reloads; verify save/reload for existing and new rich-text blocks/entries, HTML, and all core field types through the server save/read pipeline.

- Keep expanded block/object editors, file rows, and image thumbnails stable during drag updates without changing their drag appearance.
- Use modal input dialogs and alert-dialog confirmations for sidebar and content-page actions, honoring configured confirmation text and keeping failed submissions open for retry.

- Standardize Code, Text, and Rich Text fields on a 128px minimum height, including rich-text source mode and loading placeholders.

- Kept HTML headers and footers use shared editable containers. Editable links preserve standard and configured attributes; direct inline children normalize into paragraphs in both formats.

- Slash menu keyboard selection scrolls into view, with a viewport-limited scrollable list.

- Saving an existing structured entry with `settings.content.merge: true` reads the correct GitHub path and branch before merging.

- Delayed rich-text value acknowledgments no longer reset newer typing. The correction lives in the shared editor; explicit external content replacements remain supported.

- Use the shared 128px minimum height for configuration and source editors, including loading placeholders; match rich-text and code-field placeholders to their minimum heights.

- Improve History skeleton contrast in dark dropdowns and shorten the Actions refresh tooltip.

- Add an Actions header refresh tooltip, including disabled loading and empty states.

- Show the triggering user’s recorded email in Actions tooltips and include it in run filtering.

- Put action status first and show relative start times with the exact UTC timestamp in a tooltip; align loading and empty table columns.

- Store the media view preference in a browser cookie so server rendering and hydration use the same gallery/list layout without a skeleton flash.

- Center gallery folder labels with horizontal padding and remember the media gallery/list preference in browser storage across repositories and media pickers.

- Use ghost styling for Actions and Cache refresh buttons, including loading and empty states.

- Preserve the Actions table and disabled header controls without configured actions; show search spinners only while applying server-side keyword changes, rather than initial loading or background refresh.

- Changing rich-text editability no longer emits a content update, keeping saved Markdown untouched and Save disabled when opening an entry.

- Open GitHub installation setup in a new tab, matching installation management links.

- Match History loading row spacing and line heights to loaded entries; separate View on GitHub from other dropdown actions whenever present.

- Remove the post-save check icon from file editor Save buttons; retain loading indicators and success notifications.

- Use a pure white main background in the light theme while preserving sidebar, border and dark-theme colors.

- Move the available Admin link from the application header into the user menu, separated from user settings.

- Use a consistent 2px label-to-description gap in User settings, Admin cache settings and repository Cache, including loading placeholders.

- Align User settings label line heights, row padding and section headers; use a circular profile avatar with a disabled Upload control, omit sign-in method icons, and move installation setup into the header.

- User settings uses label/description rows with full-width dividers, compact profile saving, and Sign-in methods; omit section descriptions and match loading placeholders.

- Align User settings with Admin settings section width, spacing, headings and bordered content; move profile saving into the section header and match loading placeholders.

- Select fields use the shared 1px green focus edge instead of a neutral 3px ring, preserving destructive focus for invalid values.

- Rich-text editor focus uses the same 1px green edge as other fields; empty lists omit their drag-and-drop wrapper to avoid extra spacing.

- Restore visible Command selection in dark mode and remove its search focus border. Align empty list spacing with other fields and distinguish Required badges with light/dark fuchsia colors.

- Share one 15-second status batch between active Actions rows and triggered-run notifications; pause hidden tabs and stop completed runs. GitHub webhook updates serve routine status reads, with database-throttled discovery and recovery checks.

- Actions search is disabled without a spinner during the initial table skeleton.
- Cached files show table skeleton rows and a disabled filter on first load; subsequent filtering keeps existing rows visible.

- Replace branch submenu skeleton slots with one muted loading message below known branches.
- Invite collaborators through one expanding email textarea in core and Pro. Validate single addresses and bulk lists, deduplicate emails, and submit with Enter (Shift+Enter adds a line).
- Actions loading dropdown explicitly displays All actions.

- Add success notifications for completed mutations and one progress notification per upload batch, including partial failure counts.
- Normalize file extensions case-insensitively and never persist temporary rich-text image URLs; successful uploads retain permanent URLs even when preview loading fails.

- Branch submenu shows skeleton rows only on its first load; cached branches remain usable without a loader during refresh. Fetching still starts when the submenu opens.

- Core collaborators are repository-wide; removed the legacy branch column and scope checks. Pro permission assignments own branch restrictions.
- Command search focuses its whole input group without a second inner border; media folders match file preview dimensions.

- Core collaborator tables show Email and Status without an Access column; Pro keeps its Roles and Branches fields.

- Focus borders and outlines use the Pages CMS green in light and dark mode.

- Branch submenu separates All branches (searchable command dialog) from Create branch (a named form using the current branch as source).

- Core and Pro collaborator tables use consistent status badges: secondary badges with neutral icons and muted Invitation pending.

- Actions header follows refresh, action filter, search, and Run order. Run statuses use readable labels with icons, secondary badges with neutral icons and muted queued/in-progress statuses, and destructive badges for errors; row controls use a labelled rerun button and an overflow menu.

- Cached file filtering keeps existing rows visible while the search field shows loading.

- Admin loading states match each page’s header controls and layout. Branch lists load only when the submenu opens, with loading feedback inside that submenu.

- Cached file inspection uses an unboxed collapsible, a naturally sized table with ten rows per page, and path filtering beside pagination above the table.

- Renamed repository Settings to Configuration with a direct `/configuration` editor route. Restored opt-in repository cache management through `settings.cache: true`, enforced in navigation, route guards, and all cache-management endpoints; global admin cache controls remain available.
- Aligned repository header spacing and control sizes, removed destructive-menu separators, kept source links on one line, and added background-loading indicators to shared search fields. Repository cache inspection expands inline with paginated file metadata and SHA details.
- Reused the narrow file-editor layout and history/menu controls for configuration, fixed wrapping in file menus, and restored legacy fixed-file and Actions icons. Actions now shows a runs table with header search, Run dropdown, and manual Refresh; collaborator search lives beside invitation controls, including Pro.
- Split repository administration into Settings, Collaborators, Actions, and Cache pages under Admin. Primary controls move into page headers, including Pro controls; Settings opens directly in the configuration editor with diagnostics and unsaved-change protection.

### Tests

- Remove tests that mirror styling and synthetic payload ratios; preserve behavior, persistence, keyboard, loading and layout coverage.
- Give each browser test independent database/cache/GitHub fixture state and update branch/configuration expectations.
- Add OTP/session HTTP and authenticated billing-handler coverage; run database, composition and production media checks in CI.

### Fixed

- Give the cache viewer commit heading enough room to prevent unnecessary horizontal scrolling.

- Clear the local-draft loading message after opening an entry without a saved draft, and hide empty draft-status spacing.

- Preserve the Overview and custom commit-message controls during content-draft simplification, retain distinct new-entry drafts, and restore the 20 MB rich-text upload limit.
- Keep rich-text images with spaces, encoded parentheses, or literal percent escapes valid through save/reload.

- Image link controls now attach destinations to standalone images, preserve them through HTML/Markdown save and reopen, and select images without following their links. The image extension is shared with the editor registry.

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
