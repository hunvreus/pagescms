"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AdminTimeAgo({
  label,
  fullDate,
}: {
  label: string;
  fullDate: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-sm text-foreground">{label}</span>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{fullDate}</TooltipContent>
    </Tooltip>
  );
}
