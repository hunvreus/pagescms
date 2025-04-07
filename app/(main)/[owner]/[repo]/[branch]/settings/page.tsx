"use client";

import { EntryEditor } from "@/components/entry/entry-editor";
import { useConfig } from "@/contexts/config-context";

export default function Page() {
  const { setConfig } = useConfig();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };
  
  return (
    <EntryEditor path=".pages.yml" onSave={handleSave} title="Settings"/>
  );
}