# Pages CMS Cost-First Migration Plan (No RSC)

## Goal
Move this codebase to a client-first architecture that minimizes paid runtime on Vercel:
- Remove all React Server Components used for app logic (`async` pages/layouts that hit DB/GitHub/auth).
- Use Server Actions selectively where they are the best fit; avoid overuse on hot paths.
- Remove middleware-level request handling where possible.
- Keep Vercel runtime invocations to the minimum required for auth/webhooks/API.

## Current findings in this repo
- Middleware currently runs on all non-webhook API calls: `middleware.ts`.
- Server actions are active: `lib/actions/auth.ts`, `lib/actions/app.ts`, `lib/actions/template.ts`, `lib/actions/collaborator.ts`.
- Several layouts/pages are server components with DB/GitHub/auth calls:
  - `app/(main)/layout.tsx`
  - `app/(main)/[owner]/[repo]/layout.tsx`
  - `app/(main)/[owner]/[repo]/[branch]/layout.tsx`
  - `app/(main)/settings/page.tsx`
  - `app/(auth)/sign-in/page.tsx`
  - `app/(auth)/sign-in/collaborator/[token]/page.tsx`
- Runtime-heavy dependencies are in active request paths: `octokit`, `drizzle-orm`/`postgres`, `resend`.

## Target architecture
- UI routes are client components only.
- UI bootstraps via API calls (`/api/session`, `/api/repo`, `/api/config`, etc.), not server layouts.
- Mutations can use route handlers or Server Actions, chosen per use case and measured performance.
- Webhooks and scheduled cleanup are isolated from user-facing request path.
- Caching and revalidation rules are explicit per endpoint.

## Phased plan

### Phase 1: Baseline and hotspots
1. Capture a baseline of current runtime behavior:
  - top invoked endpoints
  - slowest endpoints
  - middleware invocation volume
2. Identify top 3 hot paths causing cost/latency.
3. Prioritize fixes by impact, not by pattern (RSC vs API vs Server Action).

Definition of done:
- We have a ranked hotspot list and baseline metrics to compare against.

### Phase 2: Remove middleware + tighten boundaries
1. Replace global middleware CSRF handling with route-level helpers on mutating endpoints (`POST/PUT/PATCH/DELETE`).
2. Remove `middleware.ts` matcher once coverage exists in route handlers.
3. Review each Server Action:
  - keep if low-frequency and simple
  - migrate if high-frequency, hard to cache, or causing latency/cold-start issues

Definition of done:
- No `middleware.ts` request handling remains.
- Kept actions are intentional and documented; migrated actions have API equivalents.

### Phase 3: Remove RSC from app routes
1. Convert remaining async server layouts/pages to client routes.
2. Add bootstrap APIs for session/user/accounts/repo/config data currently loaded in layouts.
3. Keep redirects/access checks in client router guards + API auth responses (`401/403/404`) rather than server redirects.

Definition of done:
- `app/**/layout.tsx` and `app/**/page.tsx` used in main UX are client-side for data loading.
- No DB/GitHub/auth calls directly from RSC layouts/pages.

### Phase 4: Cut Vercel runtime invocation volume
1. Audit and classify each route:
  - user-interactive hot path
  - background/admin-only
2. Remove or externalize background work from Vercel where practical:
  - for `app/api/cron/route.ts`, prefer lazy cleanup in normal request flow or move execution off Vercel; external HTTP cron alone does not reduce Vercel invocations.
3. Add response caching headers for read endpoints where safe.
4. Remove `dynamic = "force-dynamic"` unless required.

Definition of done:
- Hot-path API calls are reduced and cacheable where possible.
- No Vercel Cron dependency unless justified with cost numbers.

### Phase 5: Optional hard cut (near-zero Vercel runtime)
1. Move backend API/webhook/auth to a separate runtime (Cloudflare Worker or other service).
2. Deploy Vercel as static frontend only (or remove Vercel entirely).

Definition of done:
- Vercel is serving static assets only, or runtime invocations are intentionally retained and measured.

## Measurement workflow (every phase)
1. Baseline before/after each phase:
  - Vercel function invocations/day
  - Edge middleware invocations/day
  - bandwidth and execution duration
2. Validate behavior:
  - `npm run build`
  - smoke test auth + repo navigation + edit/save + collaborator flows
3. Record deltas in this file.

## Guardrails
- If a change does not lower runtime invocations or simplify boundaries, it is out of scope.
- Do not add new RSC/server-action usage without a clear performance/cost justification.
- Server Action rule:
  - keep for low-frequency UX operations with minimal overhead
  - avoid for high-frequency reads/writes where caching, batching, or transport control matters more
- Keep app shippable at each phase; migrate incrementally behind stable endpoints.

## Start here (execution order)
1. Instrument and baseline this week:
  - capture endpoint invocation counts and p95 latency from Vercel
  - list middleware invocations/day
2. First code changes:
  - remove `dynamic = "force-dynamic"` from `app/api/repos/[owner]/route.ts` unless proven necessary
  - add safe caching (`Cache-Control` + ETag/304) on 2 high-read GET endpoints
3. Middleware removal:
  - implement route-level CSRF checks on mutating endpoints
  - delete `middleware.ts` once parity is verified
4. RSC reduction kickoff:
  - migrate `app/(main)/layout.tsx`
  - then `app/(main)/[owner]/[repo]/layout.tsx`
  - then `app/(main)/[owner]/[repo]/[branch]/layout.tsx`
5. Server Action review:
  - keep each action unless metrics show it is a hotspot or architectural blocker
6. Parallel track:
  - plan Lucia -> Better Auth migration after baseline is in place so impact is measurable
