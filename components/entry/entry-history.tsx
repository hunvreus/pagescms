"use client";

import { formatDistanceToNow } from "date-fns";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { useConfig } from "@/contexts/config-context";
import { ArrowUpRight } from "lucide-react";
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
import { History } from "lucide-react";

export function EntryHistoryBlock({
  path,
  history,
}: {
  path: string;
  history: any;
}) {
  const { config } = useConfig();

  if (!history || history.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-y-1 text-sm">
        {history.slice(0, 3).map((item: any) => (
          <a
            href={item.html_url}
            target="_blank"
            key={item.sha}
            className="flex items-center rounded-lg px-3 py-2 transition-all hover:bg-accent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={item.author?.login ? `https://github.com/${item.author.login}.png` : undefined} alt={`${item.commit.author.name}'s avatar`} />
              <AvatarFallback>{getInitialsFromName(item.commit.author.name)}</AvatarFallback>
            </Avatar>
            <div className="text-left overflow-hidden ml-3">
              <div className="text-sm font-medium truncate">{item.commit.author.name || item.author.login}</div>
              <div className="text-xs text-muted-foreground truncate">{formatDistanceToNow(new Date(item.commit.author.date))} ago</div>
            </div>
          </a>
        ))}
        {history.length > 3 && (
          <a
            href={`https://github.com/${config?.owner}/${config?.repo}/commits/${encodeURIComponent(config!.branch)}/${path}`}
            target="_blank"
            className="flex items-center rounded-lg px-3 py-2 transition-all hover:bg-accent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="mr-4">See all changes</span>
            <ArrowUpRight className="h-3 w-3 ml-auto min-ml-4 opacity-50" />
          </a>
        )}
      </div>
    </>
  );
}

export function EntryHistoryDropdown({
  path,
  history,
}: {
  path: string;
  history: any;
}) {
  const { config } = useConfig();

  if (!history || history.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon">
            <History className="h-4 w-4"/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {history.slice(0, 3).map((item: any) => (
            <DropdownMenuItem key={item.sha} asChild>
              <a href={item.html_url} target="_blank" className="w-full truncate">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={item.author?.login ? `https://github.com/${item.author.login}.png` : undefined} alt={`${item.commit.author.name}'s avatar`} />
                  <AvatarFallback>{getInitialsFromName(item.commit.author.name)}</AvatarFallback>
                </Avatar>
                <div className="text-left overflow-hidden ml-3">
                  <div className="truncate">{item.commit.author.name || item.author.login}</div>
                  <div className="text-xs text-muted-foreground truncate">{formatDistanceToNow(new Date(item.commit.author.date))} ago</div>
                </div>
              </a>
            </DropdownMenuItem>
          ))}
          {history.length > 3 && (
            <>
              <DropdownMenuSeparator/>
              <DropdownMenuItem>
                <a
                  href={`https://github.com/${config?.owner}/${config?.repo}/commits/${encodeURIComponent(config!.branch)}/${path}`}
                  target="_blank"
                  className="flex items-center w-full"
                >
                  <span className="mr-4">See all changes</span>
                  <ArrowUpRight className="h-3 w-3 ml-auto min-ml-4 opacity-50" />
                </a>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}