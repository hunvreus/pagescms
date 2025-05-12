"use client";

import { useMemo, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { getParentPath, getRelativePath, joinPathSegments, normalizePath } from "@/lib/utils/file";
import { getSchemaByName } from "@/lib/schema";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function FileRename({
  isOpen,
  onOpenChange,
  path,
  type,
  sha,
  name,
  onRename
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  type: "collection" | "file" | "media" | "settings";
  sha: string;
  name?: string;
  onRename?: (path: string, newPath: string) => void;
}) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  
  if (!name) throw new Error("Name is required for FileRename");

  const schema = getSchemaByName(config.object, name, type);
  if (!schema) throw new Error(`Schema not found for ${name}.`);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const relativePath = useMemo(() => getRelativePath(normalizedPath, schema.path), [normalizedPath, schema.path]);

  const [newRelativePath, setNewRelativePath] = useState(relativePath);

  const handleRename = async () => {
    try {
      const newPath = joinPathSegments([schema.path, normalizePath(newRelativePath)]);
      
      const renamePromise = new Promise(async (resolve, reject) => {
        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizedPath)}/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: (type === "collection" || type === "file") ? "content" : type,
              name,
              newPath,
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
        loading: `Renaming "${path}" to "${newPath}"`,
        success: (data: any) => {
          if (onRename) onRename(path, newPath);
          return data.message;
        },
        error: (error: any) => error.message,
      });
    } catch (error) {
      console.error(error);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>      
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <Input
          defaultValue={relativePath}
          onChange={(e) => setNewRelativePath(e.target.value)}
        />
        <DialogFooter className="max-sm:gap-y-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="submit" onClick={handleRename}>Rename</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
