"use client";

import { EntryEditor } from "@/components/entry/entry-editor";
import { useConfig } from "@/contexts/config-context";

export default function Page() {
  const { setConfig } = useConfig();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };

  // TODO: check if pages.yml exists and offer to create it if not
  return (
    <EntryEditor path=".pages.yml" onSave={handleSave} title="Settings"/>
  );
}