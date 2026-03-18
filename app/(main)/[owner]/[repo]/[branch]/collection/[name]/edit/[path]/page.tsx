"use client";

import { use, useMemo } from "react";
import { DocumentTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";
import { Entry } from "@/components/entry/entry";
import { formatRepoBranchTitle } from "@/lib/title";

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
  if (!config) throw new Error(`Configuration not found.`);

  const schemaName = decodeURIComponent(resolvedParams.name);
  const schema = useMemo(() => getSchemaByName(config.object, schemaName), [config, schemaName]);
  if (!schema) throw new Error(`Schema not found for ${schemaName}.`);
  const decodedPath = decodeURIComponent(resolvedParams.path);
  const filename = decodedPath.split("/").pop() || decodedPath;
  
  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(`Edit ${filename} | ${schema.label || schema.name}`, config.owner, config.repo, config.branch)}
      />
      <Entry name={schemaName} path={decodedPath}/>
    </>
  );
}
