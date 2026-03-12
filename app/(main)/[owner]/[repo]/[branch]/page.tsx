"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { Message } from "@/components/message";
import { hasGithubIdentity } from "@/lib/authz";

export default function Page() {
  const { config } = useConfig();
  const { user } = useUser();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (config?.object.content?.[0]) {
      router.replace(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${config.object.content[0].type}/${config.object.content[0].name}`);
    } else if (config?.object.media) {
      router.replace(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${config.object.media[0].name}`);
    } else if (hasGithubIdentity(user) && !config?.object?.settings?.hide) {
      router.replace(`/${config?.owner}/${config?.repo}/${encodeURIComponent(config!.branch)}/settings`);
    } else {
      setError(true);
    }
  }, [config, router, user]);
  
  return error
    ? (
      hasGithubIdentity(user)
        ? <Message
            title="Nothing to see here."
            description={<>This branch and/or repository has no configuration and settings are disabled. Edit on GitHub if you think this is a mistake.</>}
            className="absolute inset-0"
            cta="Edit configuration on GitHub"
            href={`https://github.com/${config?.owner}/${config?.repo}/edit/${encodeURIComponent(config!.branch)}/.pages.yml`}
          />
        : <Message
            title="Repository not configured yet"
            description="This repository does not have a .pages.yml file yet. Ask a GitHub admin to initialize repository settings first."
            className="absolute inset-0"
          />
    )
    : null;
}
