"use client";

import { Entry } from "@/components/entry/entry";
import { useConfig } from "@/contexts/config-context";

export default function Page() {
  const { setConfig } = useConfig();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };
  
  return (
    <Entry path=".pages.yml" onSave={handleSave} title="Settings"/>
  );
}
