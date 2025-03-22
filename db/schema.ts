import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

const userTable = sqliteTable("user", {
  id: text("id").notNull().primaryKey(),
  githubEmail: text("github_email"),
  githubName: text("github_name"),
  githubId: integer("github_id").unique(),
  githubUsername: text("github_username"),
  email: text("email").unique()
});

const sessionTable = sqliteTable("session", {
  id: text("id").notNull().primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id)
}, table => ({
  idx_session_userId: index("idx_session_userId").on(table.userId)
}));

const githubUserTokenTable = sqliteTable("github_user_token", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id)
}, table => ({
  idx_github_user_token_userId: uniqueIndex("idx_github_user_token_userId").on(table.userId)
}));

const githubInstallationTokenTable = sqliteTable("github_installation_token", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  installationId: integer("installation_id").notNull(),
  expiresAt: integer("expires_at").notNull()
}, table => ({
  idx_github_installation_token_installationId: index("idx_github_installation_token_installationId").on(table.installationId)
}));

const emailLoginTokenTable = sqliteTable("email_login_token", {
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at").notNull()
});

const collaboratorTable = sqliteTable("collaborator", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  installationId: integer("installation_id").notNull(),
  ownerId: integer("owner_id").notNull(),
  repoId: integer("repo_id"),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch"),
  email: text("email").notNull(),
  userId: text("user_id").references(() => userTable.id),
  status: text("type"),
  invitedBy: text("invited_by").notNull().references(() => userTable.id)
}, table => ({
  idx_collaborator_owner_repo_email: index("idx_collaborator_owner_repo_email").on(table.owner, table.repo, table.email),
  idx_collaborator_userId: index("idx_collaborator_userId").on(table.userId)
}));

const configTable = sqliteTable("config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  sha: text("sha").notNull(),
  version: text("version").notNull(),
  object: text("object").notNull()
}, table => ({
  idx_config_owner_repo_branch: uniqueIndex("idx_config_owner_repo_branch").on(table.owner, table.repo, table.branch)
}));

const cacheFileTable = sqliteTable("cache_file", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  context: text("context").notNull().default('collection'),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  parentPath: text("parent_path").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  type: text("type").notNull(),
  content: text("content"),
  sha: text("sha"),
  size: integer("size"),
  downloadUrl: text("download_url"),
  commitSha: text('commit_sha'),
  commitTimestamp: integer('commit_timestamp'),
  lastUpdated: integer("last_updated").notNull()
}, table => ({
  idx_cache_file_owner_repo_branch_parentPath: index("idx_cache_file_owner_repo_branch_parentPath").on(table.owner, table.repo, table.branch, table.parentPath),
  idx_cache_file_owner_repo_branch_path: uniqueIndex("idx_cache_file_owner_repo_branch_path").on(table.owner, table.repo, table.branch, table.path)
}));

const cachePermissionTable = sqliteTable("cache_permission", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  githubId: integer("github_id").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  lastUpdated: integer("last_updated").notNull()
}, table => ({
  idx_cache_permission_githubId_owner_repo: uniqueIndex("idx_cache_permission_githubId_owner_repo").on(table.githubId, table.owner, table.repo)
}));

export {
  userTable,
  sessionTable,
  githubUserTokenTable,
  githubInstallationTokenTable,
  emailLoginTokenTable,
  collaboratorTable,
  configTable,
  cacheFileTable,
  cachePermissionTable
};