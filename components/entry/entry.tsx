"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfig } from "@/contexts/config-context";
import { parseAndValidateConfig } from "@/lib/config";
import { generateFilename, getPrimaryField, getSchemaByName } from "@/lib/schema";
import {
  getFileExtension,
  getFileName,
  getParentPath,
  getRelativePath,
  joinPathSegments,
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
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner";
import { EllipsisVertical, History } from "lucide-react";
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
  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);

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
    } finally {
      setIsSaving(false);
    }
  };

  const isBusy = isLoading || isSaving;

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

  const breadcrumbNode = useMemo(() => {
    if (!path || schemaType !== "collection" || !schema) {
      return <BreadcrumbPage className="font-semibold truncate">{displayTitle}</BreadcrumbPage>;
    }

    const rootLabel = schema.label || schema.name || name;
    const rootPath = normalizePath(schema.path);
    const parentPath = normalizePath(getParentPath(path));
    const relativePath = getRelativePath(parentPath, rootPath);
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

    const parentEntries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([rootPath, segments.slice(0, index + 1).join("/")]),
    }));

    const immediateParent = parentEntries.length > 0 ? parentEntries[parentEntries.length - 1] : null;
    const middleEntries = parentEntries.length > 1 ? parentEntries.slice(0, -1) : [];

    return (
      <>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}`}>
              {rootLabel}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />

        {middleEntries.length > 0 && (
          <>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center">
                  <BreadcrumbEllipsis className="h-4 w-4" />
                  <span className="sr-only">Show hidden segments</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {middleEntries.map((entry) => (
                    <DropdownMenuItem key={entry.path} asChild>
                      <Link href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}?path=${encodeURIComponent(entry.path)}`}>
                        {entry.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        {immediateParent && (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}?path=${encodeURIComponent(immediateParent.path)}`}>
                  {immediateParent.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}

        <BreadcrumbItem>
          <BreadcrumbPage className="font-semibold truncate">{displayTitle}</BreadcrumbPage>
        </BreadcrumbItem>
      </>
    );
  }, [config.branch, config.owner, config.repo, displayTitle, name, path, schema, schemaType]);

  const headerNode = useMemo(() => (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Breadcrumb>
          <BreadcrumbList className="font-semibold text-lg">
            {breadcrumbNode}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-x-2">
        {isBusy
          ? <Button variant="ghost" size="icon" className="shrink-0" disabled><History /></Button>
          : path && history && <EntryHistoryDropdown history={history} path={path} />
        }
        <Button type="submit" form="entry-form" disabled={isBusy}>
          Save
        </Button>
        {isBusy
          ? <Button variant="ghost" size="icon" className="shrink-0" disabled><EllipsisVertical className="h-4 w-4" /></Button>
          : path && sha && (
            <FileOptions
              path={path}
              sha={sha}
              type={path === ".pages.yml" ? "settings" : (schemaType ?? "content")}
              name={name}
              onDelete={handleDelete}
              onRename={handleRename}
            >
              <Button variant="ghost" size="icon" className="shrink-0" disabled={isBusy}>
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </FileOptions>
          )
        }
      </div>
    </div>
  ), [breadcrumbNode, handleDelete, handleRename, history, isBusy, name, path, schemaType, sha]);

  useRepoHeader({ header: headerNode });

  const loadingSkeleton = useMemo(() => (
    <div className="w-full max-w-screen-md mx-auto grid items-start gap-6">
      {path !== ".pages.yml"
        ? 
          <>
            <div className="space-y-2">
              <Skeleton className="w-24 h-5 rounded" />
              <Skeleton className="w-full h-10 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="w-24 h-5 rounded" />
              <Skeleton className="w-full h-10 rounded-md" />
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
  ), [path]);

  
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
        fields={entryFields}
        contentObject={entryContentObject}
        onSubmit={onSubmit}
      />
  );
};
