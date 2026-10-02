import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

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
    issuer: text('issuer').notNull(),
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
    account_issuer_accountId_uidx: uniqueIndex(
      'account_issuer_accountId_uidx',
    ).on(table.issuer, table.accountId),
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
    repoId: integer('repo_id'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    branch: text('branch'),
    email: text('email').notNull(),
    userId: text('user_id').references(() => userTable.id),
    invitedBy: text('invited_by').references(() => userTable.id),
  },
  (table) => ({
    idx_collaborator_owner_repo_email: index(
      'idx_collaborator_owner_repo_email',
    ).on(table.owner, table.repo, table.email),
    idx_collaborator_userId: index('idx_collaborator_userId').on(table.userId),
    uq_collaborator_owner_repo_email_ci: uniqueIndex(
      'uq_collaborator_owner_repo_email_ci',
    ).on(
      sql`lower(${table.owner})`,
      sql`lower(${table.repo})`,
      sql`lower(${table.email})`,
    ),
  }),
)

const collaboratorInviteTable = sqliteTable(
  'collaborator_invite',
  {
    id: serial('id'),
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
    ).on(
      sql`lower(${table.owner})`,
      sql`lower(${table.repo})`,
      sql`lower(${table.email})`,
    ),
  }),
)

const configTable = sqliteTable(
  'config',
  {
    id: serial('id'),
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
    ).on(table.source, table.owner, table.repo, table.branch),
  }),
)

const cacheFileTable = sqliteTable(
  'cache_file',
  {
    id: serial('id'),
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
    commitSha: text('commit_sha'),
    commitTimestamp: timestamp('commit_timestamp'),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => ({
    idx_cache_file_source_owner_repo_branch_parentPath: index(
      'idx_cache_file_source_owner_repo_branch_parentPath',
    ).on(table.source, table.owner, table.repo, table.branch, table.parentPath),
    idx_cache_file_source_owner_repo_branch_path_context: uniqueIndex(
      'idx_cache_file_source_owner_repo_branch_path_context',
    ).on(
      table.source,
      table.owner,
      table.repo,
      table.branch,
      table.path,
      table.context,
    ),
  }),
)

const cacheFileMetaTable = sqliteTable(
  'cache_file_meta',
  {
    id: serial('id'),
    source: text('source').notNull().default('github.com'),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    branch: text('branch').notNull(),
    path: text('path').notNull().default(''),
    context: text('context').notNull().default('branch'),
    commitSha: text('commit_sha'),
    commitTimestamp: timestamp('commit_timestamp'),
    status: text('status').notNull().default('ok'),
    error: text('error'),
    publicationToken: text('publication_token'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    lastCheckedAt: timestamp('last_checked_at').notNull().defaultNow(),
  },
  (table) => ({
    idx_cache_file_meta_source_owner_repo_branch_path_context: uniqueIndex(
      'idx_cache_file_meta_source_owner_repo_branch_path_context',
    ).on(
      table.source,
      table.owner,
      table.repo,
      table.branch,
      table.path,
      table.context,
    ),
  }),
)

const cachePermissionTable = sqliteTable(
  'cache_permission',
  {
    id: serial('id'),
    githubId: integer('github_id').notNull(),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    lastUpdated: timestamp('last_updated').notNull(),
  },
  (table) => ({
    idx_cache_permission_githubId_owner_repo: uniqueIndex(
      'idx_cache_permission_githubId_owner_repo',
    ).on(table.githubId, table.owner, table.repo),
  }),
)

const actionRunTable = sqliteTable(
  'action_run',
  {
    id: serial('id'),
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
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    idx_action_run_owner_repo_createdAt: index(
      'idx_action_run_owner_repo_createdAt',
    ).on(table.owner, table.repo, table.createdAt),
    idx_action_run_owner_repo_actionName: index(
      'idx_action_run_owner_repo_actionName',
    ).on(table.owner, table.repo, table.actionName),
    idx_action_run_owner_repo_status: index(
      'idx_action_run_owner_repo_status',
    ).on(table.owner, table.repo, table.status),
    idx_action_run_context: index('idx_action_run_context').on(
      table.owner,
      table.repo,
      table.contextType,
      table.contextName,
      table.contextPath,
    ),
    idx_action_run_workflowRunId: uniqueIndex(
      'idx_action_run_workflowRunId',
    ).on(table.workflowRunId),
  }),
)

export {
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  githubInstallationTokenTable,
  collaboratorTable,
  collaboratorInviteTable,
  configTable,
  cacheFileTable,
  cacheFileMetaTable,
  cachePermissionTable,
  actionRunTable,
}
