"use client";

import { useMemo, Fragment, useState } from "react";
import { FileRename } from "@/components/file/file-rename";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil } from "lucide-react";
import { Ellipsis, ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export function FilePath({
  path,
  sha,
  type,
  name,
  onRename
}: {
  path: string;
  sha: string;
  type: "collection" | "file" | "media" | "settings";
  name?: string;
  onRename?: (path: string, newPath: string) => void;
}) {
  const pathSegments = useMemo(() => path.split("/"), [path]);

  const [isRenameOpen, setIsRenameOpen] = useState(false);

  return (
    <>
      <div className="flex items-center w-full">
        <div className="flex-1 flex items-center gap-x-1 overflow-hidden rounded-md rounded-r-none border-l border-y border-input  bg-muted px-3 py-1 text-muted-foreground h-10 max-sm:hidden">
          {pathSegments.length > 3 &&
            <>
              <Ellipsis className="h-4 w-4 shrink-0" />
              <ChevronRight className="h-4 w-4 shrink-0" />
            </>
          }
          {pathSegments.slice(pathSegments.length > 3 ? -2 : 0).map((segment, index, array) => (
            <Fragment key={index}>
              <div className="flex items-center gap-x-1.5 truncate">
                {index !== array.length - 1 && <Folder className="h-4 w-4 shrink-0" />}
                <span className={cn("truncate", index === array.length - 1 && "text-foreground")}>{segment}</span>
              </div>
              {index !== array.length - 1 && <ChevronRight className="h-4 w-4 shrink-0" />}
            </Fragment>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-x-1 overflow-hidden rounded-md rounded-r-none border-l border-y border-input  bg-muted px-3 py-1 h-10 sm:hidden">
          <span className="truncate">{path}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline" className="rounded-l-none" size="icon" onClick={() => setIsRenameOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Rename
          </TooltipContent>
        </Tooltip>
      </div>

      <FileRename
        isOpen={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        path={path}
        type={type}
        sha={sha}
        name={name}
        onRename={onRename}
      />
    </>
  );
}
