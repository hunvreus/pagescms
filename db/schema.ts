import {
  sqliteTable,
  text,
  integer,
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
});

const historyTable = sqliteTable("history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  lastVisited: integer("last_visited").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id)
});

const githubUserTokenTable = sqliteTable("github_user_token", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id)
});

const githubInstallationTokenTable = sqliteTable("github_installation_token", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  installationId: integer("installation_id").notNull(),
  expiresAt: integer("expires_at").notNull()
});

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
});

const configTable = sqliteTable("config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  sha: text("sha").notNull(),
  version: text("version").notNull(),
  object: text("object").notNull()
});

const cachedEntriesTable = sqliteTable("cached_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull(),
  parentPath: text("parent_path").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  type: text("type").notNull(),
  content: text("content"),
  sha: text("sha"),
  lastUpdated: integer("last_updated").notNull()
});

export {
  userTable,
  sessionTable,
  historyTable,
  githubUserTokenTable,
  githubInstallationTokenTable,
  emailLoginTokenTable,
  collaboratorTable,
  configTable,
  cachedEntriesTable
};