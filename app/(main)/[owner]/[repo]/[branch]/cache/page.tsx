"use client";

import { CachePage } from "@/components/cache/cache-page";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz";
import { isCacheEnabled } from "@/lib/config-settings";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function Page() {
  const { config } = useConfig();
  const { user } = useUser();

  if (!config) throw new Error("Configuration not found.");

  if (!hasGithubIdentity(user)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Access restricted</EmptyTitle>
          <EmptyDescription>Only GitHub users can manage cache.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!isCacheEnabled(config.object)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Cache is disabled</EmptyTitle>
          <EmptyDescription>Enable it in your .pages.yml with settings.cache: true.</EmptyDescription>
        </EmptyHeader>
      </Empty>
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
