"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { MediaView} from "@/components/media/media-view";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";

export default function Page({
  params
}: {
  params: Promise<{
    name: string;
  }>
}) {
  const resolvedParams = use(params);
  const { config } = useConfig();
  if (!config) throw new Error("Configuration not found.");
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "";
  const schema = getSchemaByName(config.object, decodeURIComponent(resolvedParams.name), "media");
  const displayName = schema?.label || schema?.name || decodeURIComponent(resolvedParams.name);
  
  return (
    <div className="max-w-screen-xl mx-auto flex-1 flex flex-col h-full">
      <DocumentTitle
        title={formatRepoBranchTitle(displayName, config.owner, config.repo, config.branch)}
      />
      <div className="flex flex-col relative flex-1">
        <MediaView initialPath={path} media={resolvedParams.name} />
      </div>
    </div>
  );
}
