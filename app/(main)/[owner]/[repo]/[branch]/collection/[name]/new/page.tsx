"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { Entry } from "@/components/entry/entry";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";

export default function Page({
  params
}: {
  params: Promise<{
    owner: string;
    repo: string;
    branch: string;
    name: string;
    path: string;
  }>
}) {
  const resolvedParams = use(params);
  const { config } = useConfig();
  if (!config) throw new Error("Configuration not found.");
  const searchParams = useSearchParams();
  const parent = searchParams.get("parent") || undefined;
  const schemaName = decodeURIComponent(resolvedParams.name);
  const schema = getSchemaByName(config.object, schemaName);
  const displayName = schema?.label || schema?.name || schemaName;

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(`New entry | ${displayName}`, config.owner, config.repo, config.branch)}
      />
      <Entry name={schemaName} title="Create a new entry" parent={parent}/>
    </>
  );
}
