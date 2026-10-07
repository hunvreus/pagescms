import { getTableColumns, getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'

import * as schema from './schema'

describe('legacy-compatible database schema', () => {
  it('preserves every production table name', () => {
    expect(
      [
        schema.userTable,
        schema.sessionTable,
        schema.accountTable,
        schema.verificationTable,
        schema.githubInstallationTokenTable,
        schema.collaboratorTable,
        schema.collaboratorInviteTable,
        schema.configTable,
        schema.cacheFileTable,
        schema.cacheFileMetaTable,
        schema.actionRunTable,
      ].map(getTableName),
    ).toEqual([
      'user',
      'session',
      'account',
      'verification',
      'github_installation_token',
      'collaborator',
      'collaborator_invite',
      'config',
      'cache_file',
      'cache_file_meta',
      'action_run',
    ])
  })

  it('preserves cache and action column names used by existing migrations', () => {
    const cacheFileColumns = getTableColumns(schema.cacheFileTable)
    expect(cacheFileColumns).toMatchObject({
      parentPath: { name: 'parent_path' },
      commitSha: { name: 'commit_sha' },
      commitTimestamp: { name: 'commit_timestamp' },
    })
    expect(cacheFileColumns).not.toHaveProperty('downloadUrl')
    expect(getTableColumns(schema.actionRunTable)).toMatchObject({
      workflowRunId: { name: 'workflow_run_id' },
      triggeredBy: { name: 'triggered_by' },
      completedAt: { name: 'completed_at' },
    })
  })

  it('namespaces repository caches and retains invitation uniqueness', () => {
    expect(
      getTableConfig(schema.configTable).indexes.map(
        (index) => index.config.name,
      ),
    ).toContain('idx_config_source_owner_repo_branch')
    expect(getTableColumns(schema.configTable)).toMatchObject({
      source: { name: 'source', notNull: true },
    })
    expect(getTableColumns(schema.cacheFileTable)).toMatchObject({
      source: { name: 'source', notNull: true },
    })
    expect(getTableColumns(schema.cacheFileMetaTable)).toMatchObject({
      source: { name: 'source', notNull: true },
    })
    expect(
      getTableConfig(schema.collaboratorInviteTable).indexes.map(
        (index) => index.config.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'uq_collaborator_invite_token',
        'uq_collaborator_invite_owner_repo_email_ci',
      ]),
    )
  })

  it('uses the Better Auth 1.7 external account identity', () => {
    expect(getTableColumns(schema.accountTable)).toMatchObject({
      issuer: { name: 'issuer', notNull: true },
    })
    expect(
      getTableConfig(schema.accountTable).indexes.map((index) => ({
        name: index.config.name,
        unique: index.config.unique,
      })),
    ).toContainEqual({
      name: 'account_issuer_accountId_uidx',
      unique: true,
    })
  })
})
