"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader as LucideLoader } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { normalizePath } from "@/lib/utils/file";
import { getSchemaByName, initializeState } from "@/lib/schema";
import { requireApiSuccess } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EmptyCreate = ({
  children,
  type,
  name,
  onCreate
}: {
  children: React.ReactNode;
  type: "content" | "media" | "settings";
  name?: string;
  onCreate?: (path: string) => void;
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  let path = "";
  let content: string | Record<string, any> = "";
  let toCreate = "";
  let redirectTo = `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}`;

  if (type === "settings") {
    path = ".pages.yml";
    toCreate = "configuration file";
    redirectTo = `${redirectTo}/configuration`;
  } else if (type === "content" || type === "media") {
    if (!name) throw new Error(`"name" is required.`);
    const schema = getSchemaByName(config.object, name, type);
    if (!schema) throw new Error(`Schema not found for ${name}.`);

    if (type === "media") {
      path = `${schema.input}/.gitkeep`;
      toCreate = "media folder";
      redirectTo = `${redirectTo}/media/${schema.name}`;
    } else {
      if (schema.type === "file") {
        path = schema.path;
        toCreate = "file";
        if (schema.list) {
          // Root-level list files must serialize as an array.
          content = [];
        } else if (schema.fields && schema.fields.length) {
          // TODO: this will still not pass validation for patterns/required fields
          content = initializeState(schema.fields, {});
        }
      } else {
        path = `${schema.path}/.gitkeep`;
        toCreate = "collection folder";
      }
      redirectTo = `${redirectTo}/${schema.type}/${schema.name}`;
    }
  } else {
    throw new Error(`Invalid type "${type}".`);
  }
  
  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const toastId = toast.loading(`Creating ${toCreate}...`);

    try {
      const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizePath(path))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name,
          content,
          ...(path.endsWith("/.gitkeep") ? { onConflict: "error" } : {}),
        }),
      });
      await requireApiSuccess<any>(
        response,
        `Failed to create ${toCreate}`,
      );

      toast.loading(`Opening ${toCreate}...`, { id: toastId });
      onCreate?.(normalizePath(path));
      // Navigate immediately so destination route can render its loading skeleton.
      router.push(`${redirectTo}?empty-created`);
      router.refresh();
      toast.success(`Created ${toCreate}. Opening...`, { id: toastId });
    } catch (error) {
      setIsCreating(false);
      toast.error(error instanceof Error ? error.message : `Failed to create ${toCreate}.`, {
        id: toastId,
      });
    }
  };

  return (
    <Button type="button" size="sm" onClick={handleCreate} disabled={isCreating}>
      {isCreating ? (
        <span className="inline-flex items-center gap-x-2">
          Creating...
          <LucideLoader className="h-4 w-4 animate-spin" />
        </span>
      ) : children}
    </Button>
  );
};

export { EmptyCreate };
