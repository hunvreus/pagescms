# Webhooks and cache

Pages CMS caches configuration and collection/media directory snapshots in PostgreSQL when `.pages.yml` sets `settings.cache: true` (the legacy top-level `cache: true` is normalized too). Directory snapshots use a 60-second freshness window: fresh data is returned directly, while expired data is returned immediately with `stale: true` and refreshed through the request's background executor. A cold cache waits for GitHub once.

Entry, file, media, configuration, and cache-management mutations invalidate repository snapshots. Signed GitHub webhooks cover changes made outside Pages CMS:

- `push` clears the affected branch snapshots and clears configuration when `.pages.yml` changed;
- installation and repository removal events clear inaccessible data and tokens;
- repository rename/delete events clear old repository scopes;
- branch deletion and installation-account rename events clear their old scopes;
- `workflow_run` updates tracked action runs.

Configure the GitHub App webhook URL as `https://<host>/api/webhook/github`, content type `application/json`, and the same secret in GitHub and `GITHUB_APP_WEBHOOK_SECRET`. Subscribe to push, delete, installation, installation repositories, installation target, repository, and workflow run events. Invalid signatures return `401`; oversized bodies return `413`; accepted work returns `202` and completes through `waitUntil`-style background execution.

Private media previews use an authenticated `/api/media-preview/...` endpoint with an ETag and `private, max-age=60, stale-while-revalidate=300`. Do not change this to public caching: the response may contain private repository content.

If external changes look stale, use the repository Cache page to refresh or clear the relevant scope. A cleared snapshot is repopulated on the next request.
