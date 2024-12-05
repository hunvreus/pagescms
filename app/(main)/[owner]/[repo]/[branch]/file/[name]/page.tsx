"use client";

import { useMemo } from "react";
import { useConfig } from "@/contexts/config-context";
import { EntryEditor } from "@/components/entry/entry-editor";
import { getSchemaByName } from "@/lib/schema";

export default function Page({
  params
}: {
  params: {
    owner: string;
    repo: string;
    branch: string;
    name: string;
  }
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  
  const schema = useMemo(() => getSchemaByName(config?.object, decodeURIComponent(params.name)), [config, params.name]);
  if (!schema) throw new Error(`Schema not found for ${decodeURIComponent(params.name)}.`);
  
  return (
    <EntryEditor name={params.name} path={schema.path} title={schema.label || schema.name}/>
  );
}