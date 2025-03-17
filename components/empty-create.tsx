"use client";

import { useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { normalizePath } from "@/lib/utils/file";
import { getSchemaByName, initializeState } from "@/lib/schema";
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

  let path = "";
  let content: string | Record<string, any> = "";
  let toCreate = "";
  let redirectTo = `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}`;

  if (type === "settings") {
    path = ".pages.yml";
    toCreate = "configuration file";
    redirectTo = `${redirectTo}/settings`;
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
        if (schema.fields && schema.fields.length) {
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
    try {
      const createPromise = new Promise(async (resolve, reject) => {
        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizePath(path))}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              name,
              content,
            }),
          });
          if (!response.ok) {
            throw new Error(`Failed to create ${toCreate}: ${response.status} ${response.statusText}`);
          }

          const data: any = await response.json();
          
          if (data.status !== "success") throw new Error(data.message);
          
          resolve(data)
        } catch (error) {
          reject(error);
        }
      });

      toast.promise(createPromise, {
        loading: `Creating ${toCreate}`,
        success: (response: any) => {
          // TODO: for media, we want to navigate to the root, not redirect in case it's in a dialog
          router.push(`${redirectTo}?empty-created`);
          router.refresh();
          return `Successfully created ${toCreate}.`;
        },
        error: (error: any) => error.message,
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Button type="button" size="sm" onClick={handleCreate}>
      {children}
    </Button>
  );
};

export { EmptyCreate };