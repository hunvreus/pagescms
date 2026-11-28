import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import type { AccountPreferences } from '#/shared/account-preferences'

const timestamp = <TName extends string>(name: TName) =>
  integer(name, { mode: 'timestamp_ms' })
const boolean = <TName extends string>(name: TName) =>
  integer(name, { mode: 'boolean' })
const serial = <TName extends string>(name: TName) =>
  integer(name).primaryKey({ autoIncrement: true })
const json = <TName extends string>(name: TName) => text(name, { mode: 'json' })

const userTable = sqliteTable('user', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  image: text('image'),
  githubUsername: text('github_username'),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  preferences: json('preferences')
    .$type<AccountPreferences>()
    .notNull()
    .default(sql`'{}'`),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

const sessionTable = sqliteTable(
  'session',
  {
    id: text('id').notNull().primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    idx_session_userId: index('idx_session_userId').on(table.userId),
  }),
)

const accountTable = sqliteTable(
  'account',
  {
    id: text('id').notNull().primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    idx_account_userId: index('idx_account_userId').on(table.userId),
    idx_account_providerId: index('idx_account_providerId').on(
      table.providerId,
    ),
    account_providerId_accountId_uidx: uniqueIndex(
      'account_providerId_accountId_uidx',
    ).on(table.providerId, table.accountId),
  }),
)

const verificationTable = sqliteTable(
  'verification',
  {
    id: text('id').notNull().primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    idx_verification_identifier: index('idx_verification_identifier').on(
      table.identifier,
    ),
  }),
)

const githubInstallationTokenTable = sqliteTable(
  'github_installation_token',
  {
    id: serial('id'),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    installationId: integer('installation_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => ({
    uq_github_installation_token_installationId: uniqueIndex(
      'uq_github_installation_token_installationId',
    ).on(table.installationId),
  }),
)

const collaboratorTable = sqliteTable(
  'collaborator',
  {
    id: serial('id'),
    type: text('type').notNull(),
    installationId: integer('installation_id').notNull(),
    ownerId: integer('owner_id').notNull(),
    repoId: integer('repo_id').notNull(),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    userId: text('user_id').references(() => userTable.id),
    invitedBy: text('invited_by').references(() => userTable.id),
    pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at'),
  },
  (table) => ({
    idx_collaborator_owner_repo_email: index(
      'idx_collaborator_owner_repo_email',
    ).on(table.owner, table.repo, table.email),
    idx_collaborator_userId: index('idx_collaborator_userId').on(table.userId),
    uq_collaborator_owner_repo_email_ci: uniqueIndex(
      'uq_collaborator_owner_repo_email_ci',
    ).on(table.repoId, sql`lower(${table.email})`),
  }),
)

const collaboratorInviteTable = sqliteTable(
  'collaborator_invite',
  {
    id: serial('id'),
    repoId: integer('repo_id').notNull(),
    token: text('token').notNull(),
    email: text('email').notNull(),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    uq_collaborator_invite_token: uniqueIndex(
      'uq_collaborator_invite_token',
    ).on(table.token),
    idx_collaborator_invite_owner_repo_email: index(
      'idx_collaborator_invite_owner_repo_email',
    ).on(table.owner, table.repo, table.email),
    uq_collaborator_invite_owner_repo_email_ci: uniqueIndex(
      'uq_collaborator_invite_owner_repo_email_ci',
    ).on(table.repoId, sql`lower(${table.email})`),
  }),
)

const configTable = sqliteTable(
  'config',
  {
    id: serial('id'),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => repositoryTable.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('github.com'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    branch: text('branch').notNull(),
    sha: text('sha').notNull(),
    version: text('version').notNull(),
    object: text('object').notNull(),
    lastCheckedAt: timestamp('last_checked_at').notNull().defaultNow(),
  },
  (table) => ({
    idx_config_source_owner_repo_branch: uniqueIndex(
      'idx_config_source_owner_repo_branch',
    ).on(table.repositoryId, table.branch),
  }),
)

const repositoryTable = sqliteTable(
  'repository',
  {
    id: serial('id'),
    source: text('source').notNull(),
    externalId: text('external_id'),
    ownerId: text('owner_id'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    lastOpenedAt: timestamp('last_opened_at').notNull(),
  },
  (table) => ({
    uq_repository_source_external_id: uniqueIndex(
      'uq_repository_source_external_id',
    ).on(table.source, table.externalId),
    idx_repository_owner: index('idx_repository_owner').on(
      table.source,
      table.owner,
    ),
  }),
)

const repositoryAddressTable = sqliteTable(
  'repository_address',
  {
    source: text('source').notNull(),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => repositoryTable.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uq_repository_address: uniqueIndex('uq_repository_address').on(
      table.source,
      table.owner,
      table.repo,
    ),
    idx_repository_address_id: index('idx_repository_address_id').on(
      table.repositoryId,
    ),
  }),
)

const cacheFileTable = sqliteTable(
  'cache_file',
  {
    id: serial('id'),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => repositoryTable.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('github.com'),
    context: text('context').notNull().default('collection'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    branch: text('branch').notNull(),
    parentPath: text('parent_path').notNull(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    type: text('type').notNull(),
    content: text('content'),
    sha: text('sha'),
    size: integer('size'),
    // Known file-change commit; directory snapshot revisions live in cache_file_meta.
    commitSha: text('commit_sha'),
    commitTimestamp: timestamp('commit_timestamp'),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => ({
    idx_cache_file_source_owner_repo_branch_parentPath: index(
      'idx_cache_file_source_owner_repo_branch_parentPath',
    ).on(table.repositoryId, table.branch, table.parentPath),
    idx_cache_file_source_owner_repo_branch_path_context: uniqueIndex(
      'idx_cache_file_source_owner_repo_branch_path_context',
    ).on(table.repositoryId, table.branch, table.path, table.context),
  }),
)

const cacheFileMetaTable = sqliteTable(
  'cache_file_meta',
  {
    id: serial('id'),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => repositoryTable.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('github.com'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    branch: text('branch').notNull(),
    path: text('path').notNull().default(''),
    context: text('context').notNull().default('branch'),
    commitSha: text('commit_sha'),
    commitTimestamp: timestamp('commit_timestamp'),
    refreshedAt: timestamp('refreshed_at'),
    status: text('status').notNull().default('ok'),
    error: text('error'),
    publicationToken: text('publication_token'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    lastCheckedAt: timestamp('last_checked_at').notNull().defaultNow(),
  },
  (table) => ({
    idx_cache_file_meta_source_owner_repo_branch_path_context: uniqueIndex(
      'idx_cache_file_meta_source_owner_repo_branch_path_context',
    ).on(table.repositoryId, table.branch, table.path, table.context),
  }),
)

const activityTable = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => repositoryTable.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    // Empty branch is repository-wide activity, retained once rather than copied to every branch.
    branch: text('branch').notNull(),
    kind: text('kind').notNull(),
    area: text('area').notNull(),
    resource: text('resource').notNull().default(''),
    path: text('path').notNull().default(''),
    previousPath: text('previous_path'),
    actor: text('actor'),
    actorImage: text('actor_image'),
    actorId: text('actor_id'),
    title: text('title'),
    commitSha: text('commit_sha'),
    origin: text('origin').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
  },
  (table) => ({
    idx_activity_scope_time: index('idx_activity_scope_time').on(
      table.repositoryId,
      table.branch,
      table.occurredAt,
      table.id,
    ),
  }),
)

const actionRunTable = sqliteTable(
  'action_run',
  {
    id: serial('id'),
    repositoryId: integer('repository_id')
      .notNull()
      .references(() => repositoryTable.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    ref: text('ref').notNull(),
    workflowRef: text('workflow_ref').notNull(),
    sha: text('sha').notNull(),
    actionName: text('action_name').notNull(),
    contextType: text('context_type').notNull(),
    contextName: text('context_name'),
    contextPath: text('context_path'),
    workflow: text('workflow').notNull(),
    workflowRunId: integer('workflow_run_id'),
    status: text('status').notNull(),
    conclusion: text('conclusion'),
    htmlUrl: text('html_url'),
    triggeredBy: json('triggered_by').notNull(),
    failure: json('failure'),
    payload: json('payload').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    checkedAt: timestamp('checked_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    idx_action_run_owner_repo_createdAt: index(
      'idx_action_run_owner_repo_createdAt',
    ).on(table.repositoryId, table.createdAt),
    idx_action_run_scope_time_ci: index('idx_action_run_scope_time_ci').on(
      table.repositoryId,
      table.ref,
      table.createdAt,
      table.id,
    ),
    idx_action_run_owner_repo_actionName: index(
      'idx_action_run_owner_repo_actionName',
    ).on(table.repositoryId, table.actionName),
    idx_action_run_owner_repo_status: index(
      'idx_action_run_owner_repo_status',
    ).on(table.repositoryId, table.status),
    idx_action_run_context: index('idx_action_run_context').on(
      table.repositoryId,
      table.contextType,
      table.contextName,
      table.contextPath,
    ),
    idx_action_run_workflowRunId: uniqueIndex(
      'idx_action_run_workflowRunId',
    ).on(table.workflowRunId),
  }),
)

const rateLimitTable = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
})

const deploymentSettingsTable = sqliteTable('deployment_settings', {
  id: integer('id').primaryKey(),
  defaultLanguage: text('default_language').notNull(),
})

const signInAllowlistTable = sqliteTable(
  'sign_in_allowlist',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sign_in_allowlist_type_value_idx').on(table.type, table.value),
  ],
)

const authEmailRateTable = sqliteTable(
  'auth_email_rate',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    startedAt: integer('started_at').notNull(),
  },
  (table) => [index('auth_email_rate_started_at_idx').on(table.startedAt)],
)

export {
  signInAllowlistTable,
  rateLimitTable,
  authEmailRateTable,
  deploymentSettingsTable,
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  githubInstallationTokenTable,
  collaboratorTable,
  collaboratorInviteTable,
  configTable,
  repositoryTable,
  repositoryAddressTable,
  cacheFileTable,
  cacheFileMetaTable,
  actionRunTable,
  activityTable,
}
