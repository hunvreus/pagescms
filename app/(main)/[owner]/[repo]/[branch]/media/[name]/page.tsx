"use client";

import { useSearchParams } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { MediaView} from "@/components/media/media-view";

export default function Page({
  params
}: {
  params: {
    name: string;
  }
}) {
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "";

  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  
  return (
    <div className="max-w-screen-xl mx-auto flex-1 flex flex-col h-full">
      <header className="flex items-center mb-6">
        <h1 className="font-semibold text-lg md:text-2xl">Media</h1>
      </header>
      <div className="flex flex-col relative flex-1">
        <MediaView initialPath={path} media={params.name} />
      </div>
    </div>
  );
}