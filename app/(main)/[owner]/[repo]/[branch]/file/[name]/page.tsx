"use client";

import { use, useMemo } from "react";
import { useConfig } from "@/contexts/config-context";
import { Entry } from "@/components/entry/entry";
import { DocumentTitle } from "@/components/document-title";
import { getSchemaByName } from "@/lib/schema";
import { formatRepoBranchTitle } from "@/lib/title";

export default function Page({
  params
}: {
  params: Promise<{
    owner: string;
    repo: string;
    branch: string;
    name: string;
  }>
}) {
  const resolvedParams = use(params);
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  
  const schema = useMemo(() => getSchemaByName(config?.object, decodeURIComponent(resolvedParams.name)), [config, resolvedParams.name]);
  if (!schema) throw new Error(`Schema not found for ${decodeURIComponent(resolvedParams.name)}.`);
  
  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(schema.label || schema.name, config.owner, config.repo, config.branch)}
      />
      <Entry name={resolvedParams.name} path={schema.path} title={schema.label || schema.name}/>
    </>
  );
}
