"use client";

import { formatDistanceToNow } from "date-fns";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { useConfig } from "@/contexts/config-context";
import type { EntryHistoryItem } from "@/types/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpRight, History } from "lucide-react";

function HistoryItemContent({
  item,
  compact = false,
}: {
  item: EntryHistoryItem;
  compact?: boolean;
}) {
  const authorName = item.commit.author?.name || item.author?.login || "Unknown author";
  const authorDate = item.commit.author?.date ? new Date(item.commit.author.date) : null;

  return (
    <>
      <Avatar className={compact ? "size-7" : "h-8 w-8"}>
        <AvatarImage src={item.author?.login ? `https://github.com/${item.author.login}.png` : undefined} alt={`${authorName}'s avatar`} />
        <AvatarFallback>{getInitialsFromName(authorName)}</AvatarFallback>
      </Avatar>
      <div className={compact ? "text-left overflow-hidden" : "text-left overflow-hidden ml-3"}>
        <div className={compact ? "truncate" : "text-sm font-medium truncate"}>{authorName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {authorDate ? `${formatDistanceToNow(authorDate)} ago` : "Unknown date"}
        </div>
      </div>
    </>
  );
}

export function EntryHistoryBlock({
  path,
  history,
}: {
  path: string;
  history: EntryHistoryItem[];
}) {
  const { config } = useConfig();

  if (!history || history.length === 0) return null;

  return (
    <div className="flex flex-col gap-y-1 text-sm">
      {history.slice(0, 3).map((item) => (
        <a
          href={item.html_url}
          target="_blank"
          rel="noopener noreferrer"
          key={item.sha}
          className="flex items-center rounded-lg px-3 py-2 transition-all hover:bg-accent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <HistoryItemContent item={item} />
        </a>
      ))}
      {history.length > 3 && (
        <a
          href={`https://github.com/${config?.owner}/${config?.repo}/commits/${encodeURIComponent(config!.branch)}/${path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded-lg px-3 py-2 transition-all hover:bg-accent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="mr-4">See all changes</span>
          {/* <ArrowUpRight className="h-3 w-3 ml-auto min-ml-4 opacity-50" /> */}
        </a>
      )}
    </div>
  );
}

export function EntryHistoryDropdown({
  path,
  history,
  triggerVariant = "ghost",
  triggerSize = "icon",
}: {
  path: string;
  history: EntryHistoryItem[];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
}) {
  const { config } = useConfig();

  if (!history || history.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize}>
          <History />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-3xs">
        {history.slice(0, 3).map((item) => (
          <DropdownMenuItem key={item.sha} asChild>
            <a href={item.html_url} target="_blank" rel="noopener noreferrer" className="w-full truncate flex items-center gap-3">
              <HistoryItemContent item={item} compact />
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator/>
        <DropdownMenuItem asChild>
          <a
            href={`https://github.com/${config?.owner}/${config?.repo}/commits/${encodeURIComponent(config!.branch)}/${path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center w-full"
          >
            View on GitHub
            <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
