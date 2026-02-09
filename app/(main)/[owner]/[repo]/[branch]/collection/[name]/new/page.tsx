"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { EntryEditor } from "@/components/entry/entry-editor";

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
  const searchParams = useSearchParams();
  const parent = searchParams.get("parent") || undefined;

  return (
    <EntryEditor name={decodeURIComponent(resolvedParams.name)} title="Create a new entry" parent={parent}/>
  );
}
