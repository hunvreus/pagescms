"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { Message } from "@/components/message";

export default function Page() {
  const { config } = useConfig();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (config?.object.content?.[0]) {
      router.replace(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${config.object.content[0].type}/${config.object.content[0].name}`);
    } else if (config?.object.media) {
      router.replace(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${config.object.media[0].name}`);
    } else if (!config?.object?.settings?.hide) {
      router.replace(`/${config?.owner}/${config?.repo}/${encodeURIComponent(config!.branch)}/settings`);
    } else {
      setError(true);
    }
  }, [config, router]);
  
  return error
    ? <Message
        title="Nothing to see here."
        description={<>This branch and/or repository has no configuration and settings are disabled. Edit on GitHub if you think this is a mistake.</>}
        className="absolute inset-0"
        cta="Edit configuration on GitHub"
        href={`https://github.com/${config?.owner}/${config?.repo}/edit/${encodeURIComponent(config!.branch)}/.pages.yml`}
      />
    : null;
}