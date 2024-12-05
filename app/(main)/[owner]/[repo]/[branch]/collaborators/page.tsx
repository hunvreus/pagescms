"use client";

import { Collaborators } from "@/components/collaborators";
import { useConfig } from "@/contexts/config-context";

export default function Page() {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  return (
    <div className="max-w-screen-sm mx-auto flex-1 flex flex-col h-full">
      <header className="flex items-center mb-6">
        <h1 className="font-semibold text-lg md:text-2xl">Collaborators</h1>
      </header>
      <div className="flex flex-col relative flex-1">
        <Collaborators owner={config.owner} repo={config.repo} branch={config?.branch}/>
      </div>
    </div>
  );
}