"use client";

import { Loader as LucideLoader } from "lucide-react";
import { cn } from "@/lib/utils";

export function Loader({className = "", children = ""}) {
  return (
    <div className={cn(
      "flex justify-center items-center gap-x-2",
      className
    )}>
      <LucideLoader className="h-4 w-4 animate-spin" />
      {children}
    </div>
  )
}