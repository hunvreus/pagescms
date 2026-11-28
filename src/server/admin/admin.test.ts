import { expect, it } from 'vitest'
import {
  loadAdminDashboard,
  resetGlobalCache,
  revokeUserSessions,
} from './admin'

it('reads administration data and applies changes on D1', async () => {
  const { Miniflare } = await import('miniflare')
  const { createD1Database } = await import('#/server/db/client')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'admin' },
  })
  try {
    const binding = await worker.getD1Database('DATABASE')
    await binding.batch([
      binding.prepare(
        'CREATE TABLE user (id text, name text, email text, email_verified integer, github_username text, created_at integer, updated_at integer)',
      ),
      binding.prepare('CREATE TABLE account (user_id text, provider_id text)'),
      binding.prepare('CREATE TABLE session (user_id text)'),
      binding.prepare(
        'CREATE TABLE repository (source text, owner text, repo text, external_id text, owner_id text, last_opened_at integer)',
      ),
      binding.prepare(
        'CREATE TABLE collaborator (repo_id integer, owner_id integer)',
      ),
      binding.prepare('CREATE TABLE config (id integer)'),
      binding.prepare('CREATE TABLE cache_file (id integer)'),
      binding.prepare(
        'CREATE TABLE cache_file_meta (owner text, repo text, branch text, source text)',
      ),
      binding.prepare(
        "INSERT INTO user VALUES ('u', 'User', 'u@example.test', 1, 'editor', 1000, 2000)",
      ),
      binding.prepare("INSERT INTO account VALUES ('u', 'github')"),
      binding.prepare("INSERT INTO session VALUES ('u')"),
      binding.prepare(
        "INSERT INTO repository VALUES ('github.com', 'owner', 'repo', '10', '20', 3000)",
      ),
      binding.prepare(
        "INSERT INTO repository VALUES ('github.com', 'owner', 'unknown', '11', '20', 0)",
      ),
      binding.prepare('INSERT INTO collaborator VALUES (10, 20)'),
      binding.prepare('INSERT INTO cache_file VALUES (1)'),
    ])
    const database = createD1Database(binding)
    const data = await loadAdminDashboard(database, database, {
      query: 'editor',
      page: 1,
      repoQuery: 'OWNER/REPO',
    })
    expect(data).toMatchObject({
      metrics: { users: 1, cachedFiles: 1 },
      matchingUsers: 1,
      matchingRepositories: 1,
      users: [{ emailVerified: true, githubLinked: true }],
      repositories: [{ collaborators: 1 }],
    })
    for (const query of ['_', '%', "O'Brien"]) {
      const dashboard = await loadAdminDashboard(database, database, {
        query,
        repoQuery: query,
        page: 1,
      })
      expect(dashboard.matchingUsers).toBe(0)
      expect(dashboard.matchingRepositories).toBe(0)
    }
    await binding.batch([
      binding
        .prepare("UPDATE user SET name=? WHERE id='u'")
        .bind("O'Brien_100%"),
      binding
        .prepare("UPDATE repository SET repo=? WHERE external_id='10'")
        .bind("O'Brien_100%"),
    ])
    for (const query of ['_', '%', "o'brien"]) {
      const dashboard = await loadAdminDashboard(database, database, {
        query,
        repoQuery: query,
        page: 1,
      })
      expect(dashboard.matchingUsers).toBe(1)
      expect(dashboard.matchingRepositories).toBe(1)
    }
    const unfiltered = await loadAdminDashboard(database, database, {
      query: '',
      page: 1,
    })
    expect(
      unfiltered.repositories.find(
        (repository) => repository.repo === 'unknown',
      )?.lastOpenedAt,
    ).toBeNull()
    await revokeUserSessions(database, 'u')
    await resetGlobalCache(database, 'content')
    expect(
      (await binding.prepare('SELECT * FROM session').all()).results,
    ).toEqual([])
    expect(
      (await binding.prepare('SELECT * FROM cache_file').all()).results,
    ).toEqual([])
  } finally {
    await worker.dispose()
  }
})
