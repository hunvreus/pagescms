"use client";

import { use, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";
import { Collection } from "@/components/collection/collection";

export default function Page({
  params
}: {
  params: Promise<{
    owner: string;
    repo: string;
    branch: string;
    name: string
  }>
}) {
  const resolvedParams = use(params);
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const name = decodeURIComponent(resolvedParams.name);
  const schema = useMemo(() => getSchemaByName(config?.object, name), [config, name]);
  if (!schema) throw new Error(`Schema not found for ${name}.`);

  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "";

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle(schema.label || schema.name, config.owner, config.repo, config.branch)}
      />
      <Collection name={name} path={path}/>
    </>
  );
}
