# Agent rules

## Communication
- Keep answers concise, technical, and focused on the job.
- Do not extend your answers with apologies or superfluous explanations of what you did wrong.
- Use common language, avoid vocabulary that sounds unnecessarily forced or elaborate.
- If scope is partial, state exactly what is not included.

## Architecture
- Keep API route handlers thin; put validation, permissions, and database behavior in server services.
- Keep reusable cross-feature UI in `src/components`, product UI in `src/features`, client API helpers in `src/lib`, server behavior in `src/server`, and data models in Drizzle schemas/migrations.
- Prefer small, function-first modules with explicit boundary contracts: typed inputs/outputs, side effects, error shape, and failure behavior.
- For TanStack Start, keep `src/routes` as the route contract only: route files define routing, loaders, search validation, guards, route-level pending/error behavior, and render a route or feature component.
- Do not put large UI trees, state machines, inline SVG dumps, or business logic directly in route files. Move those to feature/domain modules.
- Organize product UI and client-side feature logic under `src/features/<domain>`. Use `src/components` only for reusable, cross-feature components.
- Do not create feature/domain folders under `src/components`.
- Keep `src/components/ui` for shadcn registry primitives only. Do not add product-specific wrappers, layouts, or stateful feature components there.
- Keep shared layout components only when reused by multiple routes or when they represent a TanStack layout route boundary.
- Avoid vague structural names like `app-shell`, `shell`, `frame`, `surface`, `panel`, or `container` unless the name describes a real reusable primitive. Prefer route/domain names like `RootLayout`, `WorkspaceLayout`, `SettingsLayout`, `LoginForm`, or `WorkspaceDetail`.

## UI
- Add UI primitives through the shadcn registry: `pnpm dlx shadcn@latest add ...`.
- Prefer standard shadcn composition patterns.
- Use `FieldError` for validation, `OperationError` for action failures, and route error states for failed pages; never render caught errors directly or hard-code error colors.
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
- Do not preserve backward compatibility unless explicitly requested.
- Keep user-facing bindings/config controls data-driven, not hardcoded.
- After large changes/removals, prune dead code and simplify touched dependencies.

## Testing
- Add or update focused tests when changing behavior, permissions, parsing, persistence, jobs, exports, notifications, or public/server API contracts.
- Run the narrowest useful verification first, then broader checks when the change touches shared behavior.
- For broad or cross-cutting changes, run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Do not remove tests just to make a suite pass; fix behavior or update stale expectations deliberately.

## Documentation
- Use sentence-case Markdown headings.
- Comment only non-obvious intent, invariants, edge cases, and tradeoffs.
- Update docs, examples, `CHANGELOG.md`, and `TODO.md` with behavior/config/workflow/API/architecture changes.
- Prefer editing existing docs; do not add empty categories, placeholder docs, private route catalogs, or unvalidated OpenAPI specs.
- Keep transient notes, audits, feedback rounds, and baselines in `.tmp/`, issues, or temporary branches.
- Structure:
  - `README.md`: product overview, setup, common commands, and links.
  - `ARCHITECTURE.md`: system mechanics, runtime shape, data flow, invariants, and non-obvious decisions.
  - `TODO.md`: the single unresolved-work list; no TODO/backlog files under `docs/`.
  - `CHANGELOG.md`: implemented visible changes using Keep a Changelog.
  - `docs/index.md`: docs entrypoint; no `README.md` under `docs/`.
  - `docs/features/*.md`: expected product behavior and user/agent-visible invariants.
  - `docs/api/*.md`: external or agent-facing contracts; no private app route catalog.
  - `docs/development/*.md`: local setup, testing, migrations, and safe change workflows.
  - OpenAPI: only for stable external contracts when validation/generation keeps it correct.
