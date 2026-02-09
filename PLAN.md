# Pages CMS Step-by-Step Migration Plan

## Ground rules
- We go step by step and allow temporary in-between broken states.
- We follow official upgrade docs first, then optimize.
- Server Actions are allowed when they are a good fit; we avoid overuse on hot paths.

## Mandatory references
- Next.js 16 upgrade guide: `https://nextjs.org/docs/app/guides/upgrading/version-16`
- Middleware -> Proxy note: `https://nextjs.org/docs/messages/middleware-to-proxy`
- If a Next.js MCP server is available, use it to validate/assist upgrade steps; otherwise follow the docs above directly.

## Execution order

### Phase 0: Next.js 16 baseline (first priority)
1. Upgrade framework/tooling to Next 16-compatible versions.
2. Apply required Next 16 code changes:
  - async `params` / `searchParams` typing updates
  - async `cookies()` / `headers()` usage
  - `middleware.ts` -> `proxy.ts` convention
3. Get a clean framework build checkpoint.

Definition of done:
- `next@16.x` is installed.
- `npx next build` passes.
- Any remaining `npm run build` failure is only from env-dependent postbuild scripts (not framework compile errors).

### Phase 1: shadcn/ui refresh
1. Validate `components.json` and CLI compatibility.
2. Run shadcn migration/diff/update flow.
3. Update selected UI components deliberately (no blind wholesale rewrites unless required).

Definition of done:
- shadcn updates applied or explicitly deferred with rationale.
- Main UI flows still render and function.

### Phase 2: Auth migration (Lucia -> Better Auth)
1. Replace Lucia wiring in `lib/auth.ts` and auth routes.
2. Migrate session/cookie flow and proxy/auth guards.
3. Migrate schema/tables and data access required by Better Auth.
4. Preserve existing auth UX:
  - GitHub login
  - collaborator sign-in by token/email
  - sign-out

Definition of done:
- Active auth path no longer depends on Lucia.
- Better Auth handles sign-in/session validation end-to-end.

### Phase 3: Cost/perf baseline
1. Capture Vercel baseline:
  - top endpoint invocations
  - p95 latency by route
  - proxy invocation volume
2. Rank top 3 cost/perf hotspots.

Definition of done:
- We have measurable baseline and ranked hotspot targets.

### Phase 4: Cost/perf optimization
1. Add safe caching for high-read GET endpoints (`Cache-Control`, ETag/304 where useful).
2. Remove unnecessary forced dynamic behavior.
3. Re-evaluate proxy usage:
  - keep only if still needed
  - otherwise replace with route-level checks and remove global proxy matcher.
4. Review each Server Action:
  - keep low-frequency/simple cases
  - migrate high-frequency/latency-sensitive ones.

Definition of done:
- Hot-path invocations and/or latency are measurably reduced vs baseline.

### Phase 5: Architecture simplification (optional, later)
1. Reduce RSC usage where it improves cost/perf/clarity.
2. Keep API + client boundaries explicit.
3. Optional hard cut: move backend runtime off Vercel if near-zero Vercel runtime is the goal.

## Immediate next action
1. Finalize Phase 0 on this branch (Next 16 baseline checkpoint).
2. Then start Phase 1 (shadcn/ui).
3. Then Phase 2 (Better Auth).

## Deferred technical debt (track explicitly)
### React 19 readiness (post-baseline)
We intentionally stayed on React 18 for compatibility during the Next 16 baseline. Track and revisit upgrades/replacements for packages that currently block or risk React 19 adoption:
- `cmdk`
- `@tiptap/react`
- `next-themes`
- `react-day-picker`
- `@react-email/components`
- `sonner`

Definition of done:
- These packages are upgraded/replaced to React 19-compatible versions.
- Project compiles and type-checks cleanly on React 19.
