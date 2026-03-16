import { getFileName, normalizePath } from "@/lib/utils/file";

type CommitAction = "create" | "update" | "delete" | "rename";
type CommitTemplates = Partial<Record<CommitAction, string>>;

const defaultCommitTemplates: Record<CommitAction, string> = {
  create: "Create {path} (via Pages CMS)",
  update: "Update {path} (via Pages CMS)",
  delete: "Delete {path} (via Pages CMS)",
  rename: "Rename {oldPath} to {newPath}",
};

const getCommitTemplates = (configObject?: Record<string, any>): CommitTemplates => {
  const templates = configObject?.settings?.commit?.templates;
  return templates && typeof templates === "object" ? templates : {};
};

const renderCommitTemplate = (
  template: string,
  tokens: Record<string, string | undefined>,
): string => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
    const value = tokens[token];
    return typeof value === "string" ? value : "";
  });
};

const buildCommitTokens = ({
  action,
  owner,
  repo,
  branch,
  path,
  oldPath,
  newPath,
  contentName,
  user,
}: {
  action: CommitAction;
  owner: string;
  repo: string;
  branch: string;
  path?: string;
  oldPath?: string;
  newPath?: string;
  contentName?: string;
  user?: string;
}): Record<string, string> => {
  const normalizedPath = path ? normalizePath(path) : "";
  const normalizedOldPath = oldPath ? normalizePath(oldPath) : "";
  const normalizedNewPath = newPath ? normalizePath(newPath) : "";

  return {
    action,
    owner,
    repo,
    branch,
    name: contentName || "",
    user: user || "",
    path: normalizedPath,
    filename: normalizedPath ? getFileName(normalizedPath) : "",
    oldPath: normalizedOldPath,
    oldFilename: normalizedOldPath ? getFileName(normalizedOldPath) : "",
    newPath: normalizedNewPath,
    newFilename: normalizedNewPath ? getFileName(normalizedNewPath) : "",
  };
};

const resolveCommitMessage = ({
  configObject,
  templatesOverride,
  action,
  tokens,
}: {
  configObject?: Record<string, any>;
  templatesOverride?: CommitTemplates;
  action: CommitAction;
  tokens: Record<string, string | undefined>;
}): string => {
  const globalTemplates = getCommitTemplates(configObject);
  const overrideTemplate = templatesOverride?.[action];
  const template = typeof overrideTemplate === "string" && overrideTemplate.trim()
    ? overrideTemplate
    : (typeof globalTemplates[action] === "string" && globalTemplates[action]?.trim()
      ? (globalTemplates[action] as string)
      : defaultCommitTemplates[action]);
  return renderCommitTemplate(template, tokens).replace(/\s+/g, " ").trim().slice(0, 200);
};

export { buildCommitTokens, resolveCommitMessage };
