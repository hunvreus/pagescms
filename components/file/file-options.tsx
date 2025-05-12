"use client";

import { useMemo, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { getParentPath, getRelativePath, joinPathSegments, normalizePath } from "@/lib/utils/file";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  portalProps,
  onDelete,
  onRename,
  children
}: {
  path: string;
  sha: string;
  type: "collection" | "file" | "media" | "settings";
  name?: string;
  portalProps?: any;
  onDelete?: (path: string) => void;
  onRename?: (path: string, newPath: string) => void;
  children: React.ReactNode;
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const rootPath = useMemo(() => getParentPath(path), [path]);
  const relativePath = useMemo(() => getRelativePath(normalizedPath, rootPath), [normalizedPath, rootPath]);

  const [newPath, setNewPath] = useState(relativePath);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

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

          const data: any = await response.json();

          if (!response.ok) throw new Error(data.message || `Failed to delete file: ${response.status} ${response.statusText}`);

          if (data.status !== "success") throw new Error(data.message);

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

  const handleRename = async () => {
    // TODO: add better validation in dialog
    try {
      const fullNewPath = joinPathSegments([rootPath, normalizePath(newPath)]);
      
      const renamePromise = new Promise(async (resolve, reject) => {
        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizedPath)}/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: (type === "collection" || type === "file") ? "content" : type,
              name,
              newPath: fullNewPath,
            }),
          });
          if (!response.ok) throw new Error(`Failed to rename file: ${response.status} ${response.statusText}`);

          const data: any = await response.json();

          if (data.status !== "success") throw new Error(data.message);

          resolve(data);
        } catch (error) {
          reject(error);
        }
      });

      toast.promise(renamePromise, {
        loading: `Renaming "${path}" to "${fullNewPath}"`,
        success: (data: any) => {
          if (onRename) onRename(path, fullNewPath);
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
                <span className="mr-4">See on GitHub</span>
                <ArrowUpRight className="h-3 w-3 ml-auto min-ml-4 opacity-50" />
              </a>
            </DropdownMenuItem>
            {type !== "settings"
              ? <>
                  <DropdownMenuSeparator />
                  {type !== "file" &&
                    <DropdownMenuItem onSelect={() => setIsRenameOpen(true)}>
                      Rename
                    </DropdownMenuItem>
                  }
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem>
                      <span className="text-red-500">Delete</span>
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
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

      {type !== "settings" &&
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
