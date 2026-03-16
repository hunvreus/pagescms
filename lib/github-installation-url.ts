type InstallationAccount = {
  type?: string;
  login: string;
  installationId?: number | null;
};

const getGithubInstallationUrl = (account: InstallationAccount) => {
  if (account.type === "org") {
    return `https://github.com/organizations/${account.login}/settings/installations/${account.installationId ?? ""}`;
  }

  return `https://github.com/settings/installations/${account.installationId ?? ""}`;
};

export { getGithubInstallationUrl };
