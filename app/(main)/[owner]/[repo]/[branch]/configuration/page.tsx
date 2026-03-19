"use client";

import { Entry } from "@/components/entry/entry";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function Page() {
  const { config, setConfig } = useConfig();
  const { user } = useUser();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };

  if (!hasGithubIdentity(user)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Access restricted</EmptyTitle>
          <EmptyDescription>Only GitHub users can manage repository configuration.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {config && (
        <DocumentTitle
          title={formatRepoBranchTitle("Configuration", config.owner, config.repo, config.branch)}
        />
      )}
      <Entry path=".pages.yml" onSave={handleSave} title="Configuration" />
    </>
  );
}
