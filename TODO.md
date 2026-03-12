# TODO

## API Error Standardization
- Add a shared `HttpError` utility in `lib` (or equivalent) and stop duplicating `createHttpError` in routes/actions.
- Make all API routes throw typed HTTP errors for expected failures (`400/401/403/404/409`) instead of ad-hoc `Error`.
- Keep `toErrorResponse` as the single serializer for API error payloads.
- Align server-action error shaping with API route behavior (same status/message semantics).
- Add a small regression checklist: auth failure, permission denied, missing resource, validation error, conflict.

## Caching + Performance (Next)
1. Instrument hot routes/APIs with timing breakdowns (session/auth, token, DB, GitHub API).
2. Optimize `/api/repos/[owner]` selected-repo path with short server cache (keyed by user+owner+query).
3. Add/verify invalidation hooks for repo-list cache from installation/repository webhook events.
4. Add a lightweight cache status/admin view (later with Cache page): config `sha`/`lastCheckedAt`, file cache freshness.
5. Add manual cache refresh actions (config refresh + file cache invalidate) in admin/cache tools.
