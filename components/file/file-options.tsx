"use client";

import { useMemo, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { getFileName, getParentPath, getRelativePath, joinPathSegments, normalizePath } from "@/lib/utils/file";
import { getSchemaByName } from "@/lib/schema";
import { requireApiSuccess } from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { FileRename } from "@/components/file/file-rename";

export function FileOptions({
  path,
  sha,
  type,
  name,
  canDelete,
  canRename,
  canDuplicate,
  portalProps,
  onDelete,
  onRename,
  onDuplicate,
  children
}: {
  path: string;
  sha: string;
  type: "collection" | "file" | "media" | "settings";
  name?: string;
  canDelete?: boolean;
  canRename?: boolean;
  canDuplicate?: boolean;
  portalProps?: any;
  onDelete?: (path: string) => void;
  onRename?: (path: string, newPath: string) => void;
  onDuplicate?: (path: string, newPath: string) => void;
  children: React.ReactNode;
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const rootPath = useMemo(() => {
    if (type === "media" && name) {
      const schema = getSchemaByName(config.object, name, "media");
      return schema?.input || getParentPath(path);
    }
    if ((type === "collection" || type === "file") && name) {
      const schema = getSchemaByName(config.object, name);
      return schema?.path || getParentPath(path);
    }
    return getParentPath(path);
  }, [type, name, config.object, path]);
  const relativePath = useMemo(() => getRelativePath(normalizedPath, rootPath), [normalizedPath, rootPath]);
  const showRename = type !== "settings" && type !== "file" && canRename !== false;
  const showDelete = type !== "settings" && canDelete !== false;
  // Opt-in: only collection entries can be duplicated
  const showDuplicate = type === "collection" && !!name && canDuplicate === true;

  const [newPath, setNewPath] = useState(relativePath);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  // Creates a copy of the entry next to the original ("my-page-copy.md"). If the
  // name is taken, the files API picks the next free one ("my-page-copy-1.md").
  const handleDuplicate = () => {
    const apiUrl = `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}`;

    const duplicatePromise = (async () => {
      const entryResponse = await fetch(
        `${apiUrl}/entries/${encodeURIComponent(normalizedPath)}?name=${encodeURIComponent(name!)}`,
      );
      const entry = await requireApiSuccess<any>(entryResponse, "Failed to read the entry");

      const fileName = getFileName(normalizedPath);
      const dotIndex = fileName.lastIndexOf(".");
      const copyName = dotIndex > 0
        ? `${fileName.slice(0, dotIndex)}-copy${fileName.slice(dotIndex)}`
        : `${fileName}-copy`;
      const copyPath = joinPathSegments([getParentPath(normalizedPath), copyName]);

      const response = await fetch(`${apiUrl}/files/${encodeURIComponent(copyPath)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "content",
          name,
          content: entry.data.contentObject,
        }),
      });
      return requireApiSuccess<any>(response, "Failed to duplicate the entry");
    })();

    toast.promise(duplicatePromise, {
      loading: `Duplicating ${path}`,
      success: (result: any) => {
        if (onDuplicate) onDuplicate(path, result.data.path);
        return result.message;
      },
      error: (error: any) => error.message,
    });
  };

  const handleConfirmDelete = async () => {
    try {
      const deletePromise = new Promise(async (resolve, reject) => {
        try {
          const params = new URLSearchParams({ 
            sha,
            type: (type === "collection" || type === "file") ? "content" : type
          });
          if (name) params.set("name", name);

          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizedPath)}?${params.toString()}`, {
            method: "DELETE",
          });

          const data = await requireApiSuccess<any>(response, "Failed to delete file");

          resolve(data);
        } catch (error) {
          reject(error);
        }
      });

      toast.promise(deletePromise, {
        loading: `Deleting ${path}`,
        success: (data: any) => {
          if (onDelete) onDelete(path);
          return data.message;
        },
        error: (error: any) => error.message,
      });
    } catch (error) {
      console.error(error);
    }
  };
  
  return (
    <>
      <AlertDialog>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            {children}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" portalProps={portalProps}>
            <DropdownMenuItem asChild>
              <a href={`https://github.com/${config.owner}/${config.repo}/blob/${encodeURIComponent(config.branch)}/${path}`} target="_blank">
                View on GitHub
                <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
              </a>
            </DropdownMenuItem>
            {(showRename || showDelete || showDuplicate)
              ? <>
                  <DropdownMenuSeparator />
                  {showDuplicate &&
                    <DropdownMenuItem onSelect={handleDuplicate}>
                      Duplicate
                    </DropdownMenuItem>
                  }
                  {showRename &&
                    <DropdownMenuItem onSelect={() => setIsRenameOpen(true)}>
                      Rename
                    </DropdownMenuItem>
                  }
                  {showDelete && (
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem variant="destructive">
                        Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                  )}
                </>
              : null
            }
          </DropdownMenuContent>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this file?</AlertDialogTitle>
              <AlertDialogDescription>This will premanently delete &quot;{path}&quot;.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </DropdownMenu>
      </AlertDialog>

      {showRename &&
        <FileRename
          isOpen={isRenameOpen}
          onOpenChange={setIsRenameOpen}
          path={path}
          type={type}
          sha={sha}
          name={name}
          onRename={onRename}
        />
      }
    </>
  );
}
