"use client";

import { use, useMemo } from "react";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";
import { Entry } from "@/components/entry/entry";

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

  const schema = useMemo(() => getSchemaByName(config.object, decodeURIComponent(resolvedParams.name)), [config, resolvedParams.name]);
  if (!schema) throw new Error(`Schema not found for ${decodeURIComponent(resolvedParams.name)}.`);
  
  return (
    <Entry name={decodeURIComponent(resolvedParams.name)} path={decodeURIComponent(resolvedParams.path)}/>
  );
}
