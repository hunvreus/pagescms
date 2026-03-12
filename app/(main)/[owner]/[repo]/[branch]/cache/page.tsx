"use client";

import { CachePage } from "@/components/cache/cache-page";
import { Message } from "@/components/message";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz";

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

  return (
    <CachePage owner={config.owner} repo={config.repo} branch={config.branch} />
  );
}
