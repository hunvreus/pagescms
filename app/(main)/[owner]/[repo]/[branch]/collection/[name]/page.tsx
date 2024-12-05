"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";
import { CollectionView } from "@/components/collection/collection-view";

export default function Page({
  params
}: {
  params: {
    owner: string;
    repo: string;
    branch: string;
    name: string
  }
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const name = decodeURIComponent(params.name);
  const schema = useMemo(() => getSchemaByName(config?.object, name), [config, name]);
  if (!schema) throw new Error(`Schema not found for ${name}.`);

  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "";

  return (
    <div className="max-w-screen-xl mx-auto flex-1 flex flex-col">
      <header className="flex items-center mb-6">
        <h1 className="font-semibold text-lg md:text-2xl">{ schema.label || schema.name } </h1>
      </header>
      <div className="flex flex-col  flex-1">
        <CollectionView name={name} path={path}/>
      </div>
    </div>
  );
}