"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfig } from "@/contexts/config-context";
import { parseAndValidateConfig } from "@/lib/config";
import { generateFilename, getPrimaryField, getSchemaByName } from "@/lib/schema";
import {
  getFileExtension,
  getFileName,
  getParentPath,
  normalizePath
} from "@/lib/utils/file";
import { EntryForm } from "./entry-form";
import { EmptyCreate } from "@/components/empty-create";
import { FileOptions } from "@/components/file/file-options";
import { Message } from "@/components/message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronLeft, EllipsisVertical, History } from "lucide-react";
import { FilePath } from "@/components/file/file-path";

export function EntryEditor({
  name = "",
  path: initialPath,
  parent,
  title,
  onSave,
}: {
  name?: string;
  path?: string;
  parent?: string;
  title?: string;
  onSave?: (data: any) => void;
}) {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [entry, setEntry] = useState<Record<string, any> | null | undefined>({});
  const [sha, setSha] = useState<string | undefined>();
  const [displayTitle, setDisplayTitle] = useState<string>(title ?? "Edit");
  const [history, setHistory] = useState<Record<string, any>[]>();
  const [isLoading, setIsLoading] = useState(path ? true : false);
  const [error, setError] = useState<string | undefined | null>(null);
  // TODO: this feels like a bit of a hack
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  const router = useRouter();
  
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  
  let schema = useMemo(() => {
    if (!name) return;
    return getSchemaByName(config?.object, name)
  }, [config, name]);
  
  let entryFields = useMemo(() => {
    return !schema?.fields || schema.fields.length === 0
      ? [{
          name: "body",
          type: "code",
          label: false,
          options: {
            format: schema?.extension || (entry?.name && getFileExtension(entry.name)) || "markdown",
            lintFn: path === ".pages.yml"
              ? (view: any) => {
                  const {parseErrors, validationErrors} = parseAndValidateConfig(view.state.doc.toString());
                  return [...parseErrors, ...validationErrors];
                }
              : undefined
          }
        }]
      : schema?.list === true
        ? [{
            name: "listWrapper",
            label: false,
            type: "object",
            list: true,
            fields: schema.fields
          }]
        : schema.fields;
  }, [schema, entry, path]);

  let entryContentObject = useMemo(() => {
    return path
      ? schema?.list === true
        ? { listWrapper: entry?.contentObject }
        : entry?.contentObject
      : schema?.list === true
        ? { listWrapper: {} }
        : {};
  }, [schema, entry, path]);

  const navigateBack = useMemo(() => {
    const parentPath = path ? getParentPath(path) : undefined;
    return schema && schema.type === "collection"
      ? `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${schema.name}${parentPath && parentPath !== schema.path ? `?path=${encodeURIComponent(parentPath)}` : ""}`
      : ""},
    [schema, config.owner, config.repo, config.branch, path]
  );

  useEffect(() => {
    const fetchEntry = async () => {
      if (path) {
        setIsLoading(true);
        setError(null);

        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(path)}?name=${encodeURIComponent(name)}`);
          if (!response.ok) throw new Error(`Failed to fetch entry: ${response.status} ${response.statusText}`);

          const data: any = await response.json();
          
          if (data.status !== "success") throw new Error(data.message);
          
          setEntry(data.data);
          setSha(data.data.sha);

          if (initialPath && schema && schema.type === "collection") {
            const primaryField = getPrimaryField(schema);
            setDisplayTitle(`Editing "${data.data.contentObject?.[primaryField] || getFileName(normalizePath(path))}"`);
          }
        } catch (error: any) {
          setError(error.message);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchEntry();
  }, [config.branch, config.owner, config.repo, name, path, refetchTrigger, initialPath, schema]);
  
  useEffect(() => {
    // TODO: add loading for history ?
    const fetchHistory = async () => {
      if (path) {
        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(path)}/history?name=${encodeURIComponent(name)}`);
          if (!response.ok) throw new Error(`Failed to fetch entry's history: ${response.status} ${response.statusText}`);
          
          const data: any = await response.json();
          
          if (data.status !== "success") throw new Error(data.message);
          
          setHistory(data.data);
        } catch (error: any) {
          console.error(error);
        }
      }
    };

    fetchHistory();
  }, [config.branch, config.owner, config.repo, path, sha, refetchTrigger, name]);

  const onSubmit = async (contentObject: any) => {
    const savePromise = new Promise(async (resolve, reject) => {
      try {
        const savePath = path ?? `${parent ?? schema.path}/${generateFilename(schema.filename, schema, contentObject)}`;

        const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(savePath)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: path === ".pages.yml" ? "settings" : "content",
            name,
            content: schema?.list === true
              ? contentObject.listWrapper
              : contentObject,
            sha: sha
          }),
        });
        if (!response.ok) throw new Error(`Failed to save file: ${response.status} ${response.statusText}`);
        const data: any = await response.json();
      
        if (data.status !== "success") throw new Error(data.message);
        
        if (data.data.sha !== sha) setSha(data.data.sha);

        if (!path && schema.type === "collection") router.push(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeURIComponent(data.data.path)}`);

        resolve(data);
      } catch (error) {
        reject(error);
      }
    });

    toast.promise(savePromise, {
      loading: "Saving your file",
      success: (response: any) => {
        if (onSave) onSave(response.data);
        return response.message;
      },
      error: (error: any) => error.message,
    });

    try {
      await savePromise;
    } catch (error: any) {
      console.error(error.message);
    }
  };

  const handleDelete = (path: string) => {
    // TODO: disable save button or freeze form while deleting?
    if (schema.type === "collection") {
      router.push(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}`);
    } else {
      setRefetchTrigger(refetchTrigger + 1);
    }
  };

  const handleRename = (oldPath: string, newPath: string) => {
    setPath(newPath);
    router.replace(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeURIComponent(newPath)}`);
  };

  const loadingSkeleton = useMemo(() => (
    <div className="max-w-screen-xl mx-auto flex w-full gap-x-8">
      <div className="flex-1 w-0">
        <header className="flex items-center mb-6">
          {navigateBack &&
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "icon-xs" }), "mr-4 shrink-0")}
              href={navigateBack}
              prefetch={true}
            >
              <ChevronLeft className="h-4 w-4"/>
            </Link>
          }
          
          <h1 className="font-semibold text-lg md:text-2xl truncate">{displayTitle}</h1>
        </header>
        <div className="grid items-start gap-6">
          {path !== ".pages.yml"
            ? 
              <>
                <div className="space-y-2">
                  <Skeleton className="w-24 h-5 rounded" />
                  <Skeleton className="w-full h-10 rounded-md" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="w-24 h-5 rounded" />
                  <Skeleton className="w-48 h-10 rounded-md" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="w-24 h-5 rounded" />
                  <div className="grid grid-flow-col auto-cols-max gap-4">
                    <Skeleton className="w-28 h-28 rounded-md" />
                    <Skeleton className="w-28 h-28 rounded-md" />
                    <Skeleton className="w-28 h-28 rounded-md" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="w-24 h-5 rounded" />
                  <Skeleton className="w-full h-60 rounded-md" />
                </div>
              </>
            : <Skeleton className="w-full h-96 rounded-md" />
          }
        </div>
      </div>
      <div className="hidden lg:block w-64">
        <div className="flex flex-col gap-y-4 sticky top-0">
          <div className="flex gap-x-2">
            <Button type="submit" className="w-full" disabled>Save</Button>
            {path &&
              <Button variant="outline" size="icon" className="shrink-0" disabled>
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            }
          </div>
          {path && 
            <div className="flex flex-col gap-y-1 text-sm">
              <div className="flex items-center rounded-lg px-3 py-2">
                <Skeleton className="rounded-full h-8 w-8"/>
                <div className="ml-3">
                  <Skeleton className="w-24 h-5 rounded mb-2"/>
                  <Skeleton className="w-16 h-2 rounded"/>
                </div>
              </div>
              <div className="flex items-center rounded-lg px-3 py-2">
                <Skeleton className="rounded-full h-8 w-8"/>
                <div className="ml-3">
                  <Skeleton className="w-24 h-5 rounded mb-2"/>
                  <Skeleton className="w-16 h-2 rounded"/>
                </div>
              </div>
              <div className="flex items-center rounded-lg px-3 py-2">
                <Skeleton className="rounded-full h-8 w-8"/>
                <div className="ml-3">
                  <Skeleton className="w-24 h-5 rounded mb-2"/>
                  <Skeleton className="w-16 h-2 rounded"/>
                </div>
              </div>
              <div className="px-3 py-2">
                <Skeleton className="w-28 h-5 rounded mb-2"/>
              </div>
            </div>
          }
        </div>
      </div>
      <div className="lg:hidden fixed top-0 right-0 h-14 flex items-center gap-x-2 z-10 pr-4 md:pr-6">
      {path &&
          <Button variant="outline" size="icon" className="shrink-0" disabled>
            <History className="h-4 w-4" />
          </Button>
        }
        <Button type="submit" disabled>Save</Button>
        {path &&
          <Button variant="outline" size="icon" className="shrink-0" disabled>
            <EllipsisVertical className="h-4 w-4" />
          </Button>
        }
      </div>
    </div>
  ), [displayTitle, navigateBack, path]);

  
  if (error) {
    // TODO: should we use a custom error class with code?
    // TODO: errors show no header (unlike collection and media). Consider standardizing templates.
    if (error === "Not found") {
      return (
        <Message
            title="File missing"
            description={`The file "${schema.path}" has not been created yet.`}
            className="absolute inset-0"
          >
          <EmptyCreate type="content" name={schema.name}>Create file</EmptyCreate>
        </Message>
      );
    } else {
      return (
        <Message
          title="Something's wrong"
          description={error}
          className="absolute inset-0"
          cta="Go to settings"
          href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/settings`}
        />
      );
    }
  }
  
  return (
    isLoading
      ? loadingSkeleton
      : <EntryForm
        title={displayTitle}
        navigateBack={navigateBack}
        fields={entryFields}
        contentObject={entryContentObject}
        onSubmit={onSubmit}
        path={path}
        history={history}
        // filePath={(path && schema?.type === 'collection')
        //   ? <FilePath
        //       path={path}
        //       sha={sha}
        //       type={schema.type}
        //       name={name}
        //       onRename={handleRename}
        //     />
        //   : undefined
        // }
        options={path && sha &&
          <FileOptions
            path={path}
            sha={sha}
            type={path === ".pages.yml" ? "settings" : schema.type}
            name={name}
            onDelete={handleDelete}
            onRename={handleRename}
          >
            <Button variant="outline" size="icon" className="shrink-0" disabled={isLoading}>
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          </FileOptions>
        }
      />
  );
};