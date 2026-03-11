"use client";

import { Collaborators } from "@/components/collaborators";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { Message } from "@/components/message";
import { hasGithubIdentity } from "@/lib/authz";

export default function Page() {
  const { config } = useConfig();
  const { user } = useUser();
  if (!config) throw new Error(`Configuration not found.`);
  if (!hasGithubIdentity(user)) {
    return (
      <Message
        title="Access restricted"
        description="Only GitHub users can manage collaborators."
        className="absolute inset-0"
      />
    );
  }

  return (
    <div className="max-w-screen-sm mx-auto flex-1 flex flex-col h-full">
      <div className="flex flex-col relative flex-1">
        <Collaborators owner={config.owner} repo={config.repo} branch={config?.branch}/>
      </div>
    </div>
  );
}
