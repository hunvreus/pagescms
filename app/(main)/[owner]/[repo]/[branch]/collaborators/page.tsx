"use client";

import { useMemo } from "react";
import { Collaborators } from "@/components/collaborators";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { useConfig } from "@/contexts/config-context";

export default function Page() {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const headerNode = useMemo(() => (
    <h1 className="font-semibold text-lg">Collaborators</h1>
  ), []);

  useRepoHeader({ header: headerNode });

  return (
    <div className="max-w-screen-sm mx-auto flex-1 flex flex-col h-full">
      <div className="flex flex-col relative flex-1">
        <Collaborators owner={config.owner} repo={config.repo} branch={config?.branch}/>
      </div>
    </div>
  );
}
