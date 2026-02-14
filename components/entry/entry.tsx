"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfig } from "@/contexts/config-context";
import { parseAndValidateConfig } from "@/lib/config";
import { generateFilename, getPrimaryField, getSchemaByName } from "@/lib/schema";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  getFileExtension,
  getFileName,
  getParentPath,
  normalizePath
} from "@/lib/utils/file";
import { EntryForm } from "./entry-form";
import { EntryHistoryDropdown } from "./entry-history";
import { EmptyCreate } from "@/components/empty-create";
import { FileOptions } from "@/components/file/file-options";
import { Message } from "@/components/message";
import { Button } from "@/components/ui/button";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner";
import { EllipsisVertical } from "lucide-react";
import { FilePath } from "@/components/file/file-path";

export function Entry({
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
  const [displayTitle, setDisplayTitle] = useState<string>(() => {
    if (title) return title;
    if (initialPath && initialPath !== ".pages.yml") {
      return `Editing "${getFileName(normalizePath(initialPath))}"`;
    }
    return "Edit";
  });
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
  const schemaType = schema?.type;
  
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

  const collectionBreadcrumb = useMemo(() => {
    if (!path || !schema || schema.type !== "collection") return [];

    const currentParent = getParentPath(path);
    if (!currentParent || currentParent === schema.path) return [];

    const relativePath = currentParent.startsWith(`${schema.path}/`)
      ? currentParent.slice(schema.path.length + 1)
      : currentParent;
    const segments = relativePath.split("/").filter(Boolean);

    return segments.map((segment, index) => ({
      label: segment,
      fullPath: `${schema.path}/${segments.slice(0, index + 1).join("/")}`,
    }));
  }, [path, schema]);

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
          } else if (!title && path && path !== ".pages.yml") {
            setDisplayTitle(`Editing "${getFileName(normalizePath(path))}"`);
          }
        } catch (error: any) {
          setError(error.message);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchEntry();
  }, [config.branch, config.owner, config.repo, name, path, refetchTrigger, initialPath, schema, title]);
  
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

        if (!path && schemaType === "collection") router.push(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeURIComponent(data.data.path)}`);

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

  const handleDelete = useCallback((path: string) => {
    // TODO: disable save button or freeze form while deleting?
    if (schemaType === "collection") {
      router.push(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}`);
    } else {
      setRefetchTrigger((prev) => prev + 1);
    }
  }, [config.branch, config.owner, config.repo, name, router, schemaType]);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    setPath(newPath);
    router.replace(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeURIComponent(newPath)}`);
  }, [config.branch, config.owner, config.repo, name, router]);

  const loadingSkeleton = useMemo(() => (
    <div className="max-w-screen-xl mx-auto flex w-full">
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
  ), [path]);

  const headerNode = useMemo(() => (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Breadcrumb>
          <BreadcrumbList className="font-semibold text-lg">
            {schemaType === "collection" && (
              <span className="inline-flex items-center">
                <BreadcrumbItem>
                  <Link
                    href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}`}
                    prefetch={true}
                    className="transition-colors hover:text-foreground/80"
                  >
                    {schema?.label || schema?.name || name}
                  </Link>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </span>
            )}
            {collectionBreadcrumb.map((segment) => (
              <span key={segment.fullPath} className="inline-flex items-center">
                <BreadcrumbItem>
                  <Link
                    href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}?path=${encodeURIComponent(segment.fullPath)}`}
                    prefetch={true}
                    className="transition-colors hover:text-foreground/80"
                  >
                    {segment.label}
                  </Link>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </span>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold truncate">{displayTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-x-2">
        {path && history && <EntryHistoryDropdown history={history} path={path} />}
        <ButtonGroup>
          <Button type="submit" form="entry-form" disabled={isLoading}>
            Save
          </Button>
          {path && sha && (
            <FileOptions
              path={path}
              sha={sha}
              type={path === ".pages.yml" ? "settings" : (schemaType ?? "content")}
              name={name}
              onDelete={handleDelete}
              onRename={handleRename}
            >
              <Button variant="ghost" size="icon" className="shrink-0" disabled={isLoading}>
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </FileOptions>
          )}
        </ButtonGroup>
      </div>
    </div>
  ), [collectionBreadcrumb, config.branch, config.owner, config.repo, displayTitle, handleDelete, handleRename, history, isLoading, name, path, schema?.label, schema?.name, schemaType, sha]);

  useRepoHeader({
    header: headerNode,
  });

  
  if (error) {
    // TODO: should we use a custom error class with code?
    // TODO: errors show no header (unlike collection and media). Consider standardizing templates.
    if (error === "Not found") {
      return (
            <Message
            title="File missing"
            description={`The file "${path ?? schema?.path ?? "unknown"}" has not been created yet.`}
            className="absolute inset-0"
          >
          <EmptyCreate type="content" name={schema?.name ?? name}>Create file</EmptyCreate>
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
        fields={entryFields}
        contentObject={entryContentObject}
        onSubmit={onSubmit}
        filePath={(path && schema?.type === 'collection')
          ? <FilePath
              path={path}
              sha={sha ?? ""}
              type={schema.type}
              name={name}
              onRename={handleRename}
            />
          : undefined
        }
      />
  );
};
