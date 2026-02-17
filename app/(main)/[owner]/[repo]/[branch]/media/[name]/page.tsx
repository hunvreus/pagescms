"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { MediaView} from "@/components/media/media-view";

export default function Page({
  params
}: {
  params: Promise<{
    name: string;
  }>
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "";
  
  return (
    <div className="max-w-screen-xl mx-auto flex-1 flex flex-col h-full">
      <div className="flex flex-col relative flex-1">
        <MediaView initialPath={path} media={resolvedParams.name} />
      </div>
    </div>
  );
}
