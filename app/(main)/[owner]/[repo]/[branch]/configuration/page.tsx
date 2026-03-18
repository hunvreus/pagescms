"use client";

import { Entry } from "@/components/entry/entry";
import { DocumentTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { Message } from "@/components/message";
import { hasGithubIdentity } from "@/lib/authz";
import { formatRepoBranchTitle } from "@/lib/title";

export default function Page() {
  const { config, setConfig } = useConfig();
  const { user } = useUser();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };

  if (!hasGithubIdentity(user)) {
    return (
      <Message
        title="Access restricted"
        description="Only GitHub users can manage repository configuration."
        className="absolute inset-0"
      />
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
