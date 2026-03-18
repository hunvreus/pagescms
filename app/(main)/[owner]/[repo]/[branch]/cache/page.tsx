"use client";

import { CachePage } from "@/components/cache/cache-page";
import { DocumentTitle } from "@/components/document-title";
import { Message } from "@/components/message";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz";
import { isCacheEnabled } from "@/lib/config-settings";
import { formatRepoBranchTitle } from "@/lib/title";

export default function Page() {
  const { config } = useConfig();
  const { user } = useUser();

  if (!config) throw new Error("Configuration not found.");

  if (!hasGithubIdentity(user)) {
    return (
      <Message
        title="Access restricted"
        description="Only GitHub users can manage cache."
        className="absolute inset-0"
      />
    );
  }

  if (!isCacheEnabled(config.object)) {
    return (
      <Message
        title="Cache is disabled"
        description="Enable it in your .pages.yml with settings.cache: true."
        className="absolute inset-0"
      />
    );
  }

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle("Cache", config.owner, config.repo, config.branch)}
      />
      <CachePage owner={config.owner} repo={config.repo} branch={config.branch} />
    </>
  );
}
