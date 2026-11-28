# Agent rules

Keep rules pithy: one or two sentences, the rule and, if it isn't obvious, the reason.

## Architecture and comments

- Read `ARCHITECTURE.md` before changing system boundaries or invariants; keep its decision-and-rationale summary concise and link to detailed docs.
- Keep comments for non-obvious local intent, invariants, edge cases, contracts, required directives and attribution; remove stale or redundant narration. Record cross-cutting decisions and their reasons in `ARCHITECTURE.md`.

## Communication
- Keep answers concise, technical, and focused on the job.
- Do not extend your answers with apologies or superfluous explanations of what you did wrong.
- Use common language, avoid vocabulary that sounds unnecessarily forced or elaborate.
- If scope is partial, state exactly what is not included.

## Architecture
- Refactoring effort is nearly free: prefer the better solution over the convenient one, but don't churn architecture or dependencies without a clear gain.
- When replacing a library or pattern, replace it everywhere; don't leave two ways of doing the same thing.
- Runtime Drizzle imports belong only in `src/server/db` and `src/server/auth` (test fixtures excepted); see `ARCHITECTURE.md`.
- Keep API route handlers thin; put validation, permissions, and database behavior in server services.
- Keep reusable cross-feature UI in `src/components`, product UI in `src/features`, client fetchers and queries in `src/client`, request parsers in `src/shared/requests`, server behavior in `src/server`, and data models in Drizzle schemas/migrations.
- Prefer small, function-first modules with explicit boundary contracts: typed inputs/outputs, side effects, error shape, and failure behavior.
- For the SPA, keep `src/routes` as the route contract only: route files define routing, loaders, search validation, guards, route-level pending/error behavior, and render a route or feature component.
- Do not put large UI trees, state machines, inline SVG dumps, or business logic directly in route files. Move those to feature/domain modules.
- Organize product UI and client-side feature logic under `src/features/<domain>`. Use `src/components` only for reusable, cross-feature components.
- Do not create feature/domain folders under `src/components`.
- Keep `src/components/ui` for shadcn registry primitives only. Do not add product-specific wrappers, layouts, or stateful feature components there.
- Keep shared layout components only when reused by multiple routes or when they represent a TanStack layout route boundary.
- Avoid vague structural names like `app-shell`, `shell`, `frame`, `surface`, `panel`, or `container` unless the name describes a real reusable primitive. Prefer route/domain names like `RootLayout`, `WorkspaceLayout`, `SettingsLayout`, `LoginForm`, or `WorkspaceDetail`.

## UI
- Before creating common UI (e.g. sidebars or tabs), check existing primitives and the [shadcn registry](https://ui.shadcn.com/). Follow [component docs](https://ui.shadcn.com/docs/components) composition; add missing primitives through the registry.
- Show known static content immediately; skeleton only missing data, matching responsive layout. Disable controls with unknown values, retain data during refreshes, and share layout/copy between loading and loaded states.
- Use the shadcn Spinner for pending button actions. Keep action labels stable and loaders trailing; replace an existing trailing icon or the icon in icon-only controls. Preserve leading action/brand icons and expose pending state with `aria-busy` without changing accessible names.
- Keep shadcn primitive styles unchanged unless an official shadcn pattern includes the override or the user explicitly requests a customization. Do not add ad hoc typography or spacing overrides.
- Keep all Empty messages text-only, including prominent setup pages, search/filter results, compact Overview and table cells. Do not add icons, illustrations or decorative icon tiles above them.
- Empty blocks are borderless, with foreground medium-weight titles, muted descriptions and small action buttons. Use primary actions for setup and outline actions for clearing searches or retrying failures.
- Reuse `AccountMenu` everywhere. Show the user's name and email at the top, then a separator, Admin (when authorized), Account, Help, another separator, and Sign out. Open About from the logo in the page header or repository sidebar footer.
- Keep interface instructions direct; avoid repeating the product name in form headings, empty-state copy and action confirmations.
- Recent project shortcuts show the repository name and owner avatar, without an owner-name prefix.
- Use medium weight for interface headings (`font-medium`), including loading states. Section headings use `text-base`; row labels and table headers keep their own sizes. Preserve explicit bold formatting in editable content.
- Give each action one error-notification owner through `notifyError` / `withErrorNotification`. Shared mutation boundaries own their failures; callers recover without another toast or banner. Explicitly delegate ownership when a controller supplies Retry or conflict review.
- Use `FieldError` for input validation and toasts for discrete action failures or useful confirmations. Keep failed reads in their affected content with a retry, preserving existing data and table headers; reserve persistent banners for consequential conditions that need attention, such as a draft at risk. Show empty states only for confirmed empty data. Never render caught errors directly or hard-code error colors.
- Log server failures as structured events; treat client disconnects as cancellations, not application errors.
- Keep feature UI in its feature folder; promote to shared components only when reused.
- Compose vanilla shadcn primitives with Tailwind layout classes. Do not invent design-system wrappers until repeated usage proves they remove real duplication.
- Do not use shadcn block code blindly. Adapt blocks into the project structure first: thin route, feature/domain component, shadcn primitives, explicit state flow.

## Code style
- Prefer short names when clear.
- Keep control flow explicit; use simple deterministic structures like `Map`, arrays, and plain objects.
- Normalize loose inputs at module edges and keep error paths explicit.

## TypeScript
- Use strict boundary types, typed imports, and narrow interfaces.
- Avoid `any`; if unavoidable, keep scope narrow and document why.
- Verify dependency typings before guessing external API shapes.
- Use top-level type imports; do not change behavior just to silence dependency type errors.

## Change management
- Ask before removing behavior that appears intentional.
- Before the first 3.x release, update the baseline and current formats directly. The only version upgrade is the one-time 2.x collaborator migration.
- Keep user-facing bindings/config controls data-driven, not hardcoded.
- After large changes/removals, prune dead code and simplify touched dependencies.
- Changes to setup helpers, documentation, or application code do not authorize changes to live GitHub Apps. Obtain explicit approval for the exact App/environment and settings before changing permissions, event subscriptions, callbacks, credentials, or installations. Do not change or revert Production settings implicitly.
- Before an approved GitHub App rollout, distinguish permissions from event subscriptions, compare requested permissions with installation-approved grants, explain approval/notification effects, and check compatibility with the code actually deployed. Validate on a dedicated non-production App first.
- Keep GitHub App defaults minimal. Add extension permissions/events only for implemented capabilities; document required grants and rollout with that extension.

## Testing
- Add or update focused tests when changing behavior, permissions, parsing, persistence, jobs, exports, notifications, or public/server API contracts.
- Run the narrowest useful verification first, then broader checks when the change touches shared behavior.
- For broad or cross-cutting changes, run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Do not remove tests just to make a suite pass; fix behavior or update stale expectations deliberately.

## Documentation
- Use sentence-case Markdown headings.
- Avoid bold formatting inside callouts and alerts.
- Update docs, examples, `CHANGELOG.md`, and `TODO.md` with behavior/config/workflow/API/architecture changes.
- Prefer editing existing docs; do not add empty categories, placeholder docs, private route catalogs, or unvalidated OpenAPI specs.
- Keep transient notes, audits, feedback rounds, and baselines in `.tmp/`, issues, or temporary branches.
- Structure:
  - `README.md`: product overview, setup, common commands, and links.
  - `ARCHITECTURE.md`: concise system overview, key decisions and their rationale, boundaries and invariants; link to detailed docs.
  - `TODO.md`: the single unresolved-work list; no TODO/backlog files under `docs/`.
  - `CHANGELOG.md`: implemented visible changes using Keep a Changelog.
  - `docs/index.md`: docs entrypoint; no `README.md` under `docs/`.
  - `docs/features/*.md`: expected product behavior and user/agent-visible invariants.
  - `docs/api/*.md`: external or agent-facing contracts; no private app route catalog.
  - `docs/development/*.md`: local setup, testing, migrations, and safe change workflows.
  - OpenAPI: only for stable external contracts when validation/generation keeps it correct.

## Header controls

- Page-header buttons, inputs, selects, and toggle controls use the default 32px height. Use `size="icon"` for icon-only header buttons, including mobile back buttons. Use the same 32px size for settings controls and section toolbars, including search fields and bulk actions. Use small buttons for actions on individual records in lists and tables, and the input-group button size for actions inside inputs. Match loading controls to their loaded counterparts.
- Use `SearchInput` for search fields with a leading icon, including loading states. Command menus keep their command input behavior inside the same shadcn Input Group composition.

## Public documentation authoring

- Author public pages in `docs/public/` and navigation in `docs/public/docs.json` in the repository that owns the feature. Keep private development and operational material outside `docs/public/`.
- Every page requires `title` and `description` frontmatter. Set `availability: hosted` on hosted-only pages, including free hosted features. Omit it for shared OSS documentation. Availability describes deployment scope; it does not grant a Pro badge or affect access.
- Set `plan: pro` when the page's primary feature requires a Pro subscription. This is required for the automatic page-top subscription alert. Omission means no Pro alert; do not add `plan: free` as a default.
- For a shared/free feature with a paid subsection or free allowance, omit page-level `plan` and describe the paid limits in that section. Do not mark billing or overview pages as Pro simply because they discuss subscriptions. Never infer paid status from the owning repository or `availability`.
- Use globally unique stable `id` values on groups and submenus. To extend an existing group, use exactly its ID, label, type and other container properties. The website recursively merges matching containers, preserving OSS order and appending hosted entries. Page slugs must resolve in the contributing repository; duplicate page URLs and conflicting containers fail the website build.
- Do not edit generated `public/reference/` artifacts or website `docs/**/*.md` and `_data/menu.json` by hand. Run `pnpm reference:build` in both product repos, then `npm test` and `npm run build` in the website; run `pnpm reference:check` in OSS as well.

Example frontmatter for a hosted Pro feature:

```yaml
---
title: Cloud storage
description: Connect project media to S3-compatible storage.
availability: hosted
plan: pro
---
```

For a shared page with a hosted-only subsection, omit page-level `availability` and label that subsection "Hosted only" inline. Add new public pages to the owning repo's `docs/public/docs.json` unless intentionally unlisted (for example, the compact reference). Hosted-only pages belong in the hosted repo; do not place them in OSS. Markdown and LLM exports retain deployment and subscription information as plain text notes.

## Loading states

- Render known headings, labels, descriptions, instructions and independent actions immediately; skeletonize only unavailable dynamic content. Share layout and copy between pending and loaded views.
- Match loaded spacing, responsive layout and control dimensions. Disable controls until real values and permissions are available; never present guessed defaults as loaded state.
- Keep existing data visible during refreshes, with localized busy feedback. Reveal independent sections separately.
- Use shadcn primitives, named loading regions and decorative skeletons hidden from assistive technology. Every failed read must settle into an actionable error/retry state.
- Audit route/Suspense fallbacks as well as data and refresh paths. Test slow, failed and cached reads; visually verify desktop/mobile and report separately from automated checks.

## Documentation content and availability

- Keep `description` as search/SEO metadata. Do not insert it automatically into article content. Write any needed introduction explicitly in the body.
- Use a page-top availability alert for hosted-only pages; distinguish Pro-only from hosted features available on Free. For mixed pages, state requirements at the relevant section.
- Keep Fields directly accessible as a top-level navigation group. Put editing tasks in Guides.
- Public documentation explains configuration, tasks, deployment, or extension contracts. Keep UI styling specifications and implementation internals in codebase documentation. Billing content should answer concrete subscription questions.
