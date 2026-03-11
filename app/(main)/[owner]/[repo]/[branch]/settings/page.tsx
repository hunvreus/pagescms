"use client";

import { Entry } from "@/components/entry/entry";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { Message } from "@/components/message";

export default function Page() {
  const { setConfig } = useConfig();
  const { user } = useUser();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };

  if (!user?.githubUsername) {
    return (
      <Message
        title="Access restricted"
        description="Only GitHub users can manage repository settings."
        className="absolute inset-0"
      />
    );
  }
  
  return (
    <Entry path=".pages.yml" onSave={handleSave} title="Settings"/>
  );
}
