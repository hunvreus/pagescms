"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import {
  extensionCategories,
  sortFiles,
  getFileSize,
  getParentPath,
  getFileName,
  getRelativePath,
  joinPathSegments,
  normalizePath
} from "@/lib/utils/file";
import { EmptyCreate } from "@/components/empty-create";
import { FolderCreate} from "@/components/folder-create";
import { FileOptions } from "@/components/file/file-options";
import { useOptionalRepoHeader } from "@/components/repo/repo-header-context";
import { MediaUpload} from "./media-upload";
import { Message } from "@/components/message";
import { Thumbnail } from "@/components/thumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CornerLeftUp,
  House,
  Ban,
  Check,
  EllipsisVertical,  
  File,
  Folder,
  FolderPlus,
  Upload
} from "lucide-react";

function MediaHeaderActions({
  mediaName,
  path,
  onFolderCreate,
}: {
  mediaName: string;
  path: string;
  onFolderCreate: (entry: any) => void;
}) {
  return (
    <div className="flex items-center gap-x-2 shrink-0">
      <MediaUpload.Trigger>
        <Button type="button" size="sm" className="gap-2">
          <Upload />
          Upload
        </Button>
      </MediaUpload.Trigger>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <FolderCreate path={path} name={mediaName} type="media" onCreate={onFolderCreate}>
              <Button type="button" variant="outline" size="icon-sm">
                <FolderPlus />
              </Button>
            </FolderCreate>
          </div>
        </TooltipTrigger>
        <TooltipContent>Create folder</TooltipContent>
      </Tooltip>
    </div>
  );
}

const MediaView = ({
  media,
  initialPath,
  initialSelected,
  maxSelected,
  onSelect,
  onUpload,
  extensions,
  usePageHeader = true,
}: {
  media: string,
  initialPath?: string,
  initialSelected?: string[],
  maxSelected?: number,
  onSelect?: (newSelected: string[]) => void,
  onUpload?: (entry: any) => void,
  extensions?: string[],
  usePageHeader?: boolean,
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const mediaConfig = useMemo(() => {
    if (!media) return config.object.media[0];
    return config.object.media.find((item: any) => item.name === media);
  }, [media, config.object.media]);

  const pathname = usePathname();
  const router = useRouter();

  const filteredExtensions = useMemo(() => {
    if (!mediaConfig?.extensions && !extensions) return [];
    
    const allowedExtensions = extensions 
      ? mediaConfig?.extensions
        ? extensions.filter(ext => mediaConfig.extensions.includes(ext))
        : extensions
      : mediaConfig.extensions;

    return allowedExtensions || [];
  }, [extensions, mediaConfig?.extensions]);

  const filteredExtensionsSet = useMemo(
    () => new Set((filteredExtensions || []).map((ext: string) => ext.toLowerCase())),
    [filteredExtensions],
  );

  const imageExtensionsSet = useMemo(
    () => new Set(extensionCategories.image),
    [],
  );

  const filesGridRef = useRef<HTMLDivElement | null>(null);

  const [error, setError] = useState<string | null | undefined>(null);
  const [selected, setSelected] = useState(initialSelected || []);

  useEffect(() => {
    setSelected(initialSelected || []);
  }, [initialSelected]);

  const [path, setPath] = useState(() => {
    if (!mediaConfig) return "";
    if (!initialPath) return mediaConfig.input;
    const normalizedInitialPath = normalizePath(initialPath);
    if (normalizedInitialPath.startsWith(mediaConfig.input)) return normalizedInitialPath;
    console.warn(`"${initialPath}" is not within media root "${mediaConfig.input}". Defaulting to media root.`);
    return mediaConfig.input;
  });
  const [data, setData] = useState<Record<string, any>[] | undefined>(undefined);
  
  // Filter the data based on filteredExtensions when displaying
  const filteredData = useMemo(() => {
    if (!data) return undefined;
    if (filteredExtensionsSet.size === 0) return data;
    return data.filter(item => 
      item.type === "dir" ||
      filteredExtensionsSet.has(item.extension?.toLowerCase())
    );
  }, [data, filteredExtensionsSet]);

  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    if (!config) return;
    const cfg = config;

    const controller = new AbortController();

    async function fetchMedia() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/${cfg.owner}/${cfg.repo}/${encodeURIComponent(cfg.branch)}/media/${encodeURIComponent(mediaConfig.name)}/${encodeURIComponent(path)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);

        const payload: any = await response.json();
        if (payload.status !== "success") throw new Error(payload.message);
        if (controller.signal.aborted) return;

        setData(payload.data);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to fetch media.";
        setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchMedia();

    return () => {
      controller.abort();
    };
  }, [config.branch, config.owner, config.repo, mediaConfig.name, path]);

  const handleUpload = useCallback((entry: any) => {
    setData((prevData) => {
      if (!prevData) return [entry];
      return sortFiles([...prevData, entry]);
    });
    if (onUpload) onUpload(entry);
  }, [onUpload]);

  const handleDelete = useCallback((path: string) => {
    setData((prevData) => prevData?.filter((item) => item.path !== path));
  }, []);

  const handleRename = useCallback((path: string, newPath: string) => {
    setData((prevData) => {
      if (!prevData) return;
      if (getParentPath(normalizePath(path)) === getParentPath(normalizePath(newPath))) {
        const newData = prevData?.map((item) => {
          return item.path === path ? { ...item, path: newPath, name: getFileName(newPath) } : item;
        });
        return sortFiles(newData);
      }
      return prevData?.filter((item) => item.path !== path);
    });
  }, []);

  const handleFolderCreate = useCallback((entry: any) => {
    const parentPath = getParentPath(entry.path);
    const parent = {
      type: "dir",
      name: getFileName(parentPath),
      path: parentPath,
      size: 0,
      url: null,
    }
    
    setData((prevData) => {
      if (!prevData) return [parent];
      return sortFiles([...prevData, parent]);
    });
  }, []);

  const handleNavigate = useCallback((newPath: string) => {
    setPath(newPath);
    if (!onSelect) {
      const params = new URLSearchParams(window.location.search);
      params.set("path", newPath || mediaConfig.input);
      router.push(`${pathname}?${params.toString()}`);
    }
  }, [mediaConfig.input, onSelect, pathname, router]);

  const handleNavigateParent = () => {
    if (!path || path === mediaConfig.input) return;
    handleNavigate(getParentPath(path));
  }

  const handleSelect = useCallback((path: string) => {
    setSelected((prevSelected) => {
      let newSelected = prevSelected;

      if (maxSelected != null && prevSelected.length >= maxSelected) {
        newSelected = maxSelected > 1
          ? newSelected.slice(1 - maxSelected)
          : [];
      }

      newSelected = newSelected.includes(path)
        ? newSelected.filter(item => item !== path)
        : [...newSelected, path];
      
      return newSelected;
    });
  }, [maxSelected]);

  useEffect(() => {
    if (onSelect) onSelect(selected);
  }, [selected, onSelect]);

  const loadingSkeleton = useMemo(() => (
    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
      <li>
        <div className="flex items-center justify-center aspect-video text-muted">
          <Folder className="stroke-[0.5] h-[5.5rem] w-[5.5rem] animate-pulse"/>
        </div>
        <div className="flex items-center justify-center p-2">
          <div className="overflow-hidden h-9">
            <Skeleton className="w-24 h-5 rounded mb-2"/>
          </div>
        </div>
      </li>
      {[...Array(3)].map((_, index) => (
        <li key={index}>
          <Skeleton className="rounded-t-md rounded-b-none aspect-video" />
          <div className="flex items-center gap-x-2 p-2">
            <div className="overflow-hidden h-9">
              <Skeleton className="w-24 h-5 rounded mb-2"/>
              <Skeleton className="w-16 h-2 rounded"/>
            </div>
            <Button variant="ghost" size="icon-xs" className="shrink-0 ml-auto" disabled>
              <EllipsisVertical />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  ), []);

  const breadcrumbNode = useMemo(() => {
    const breadcrumbTextClass = usePageHeader ? "font-semibold text-lg flex-nowrap" : "text-sm flex-nowrap";
    const isDialog = !usePageHeader;
    const mediaTitle = mediaConfig.label || mediaConfig.name || "Media";
    const rootPath = normalizePath(mediaConfig.input);
    const currentPath = normalizePath(path || mediaConfig.input);
    const relativePath = getRelativePath(currentPath, rootPath);
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

    if (isDialog && segments.length === 0) return null;

    const entries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([rootPath, segments.slice(0, index + 1).join("/")]),
    }));

    const middleEntries = entries.length > 3 ? entries.slice(1, -1) : [];
    const visibleEntries = entries.length > 3
      ? [entries[0], entries[entries.length - 1]]
      : entries;

    return (
      <Breadcrumb>
        <BreadcrumbList className={breadcrumbTextClass}>
          <BreadcrumbItem className={entries.length === 0 ? "min-w-0 max-w-full truncate" : undefined}>
            {entries.length > 0 ? (
              <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(rootPath)}>
                {isDialog ? (
                  <>
                    <House className="size-3.5" />
                    <span className="sr-only">{mediaTitle}</span>
                  </>
                ) : (
                  mediaTitle
                )}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className={usePageHeader ? "block max-w-full font-semibold truncate" : "block max-w-full truncate"}>{mediaTitle}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {entries.length > 0 && <BreadcrumbSeparator />}

          {entries.length > 3 && (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center">
                    <BreadcrumbEllipsis className="h-4 w-4" />
                    <span className="sr-only">Show hidden segments</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {middleEntries.map((entry) => (
                      <DropdownMenuItem
                        key={entry.path}
                        className="cursor-pointer"
                        onClick={() => handleNavigate(entry.path)}
                      >
                        {entry.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}

          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;
            return (
              <Fragment key={entry.path}>
                <BreadcrumbItem className={isLast ? "min-w-0 max-w-full truncate" : undefined}>
                  {isLast ? (
                    <BreadcrumbPage className={usePageHeader ? "block max-w-full font-semibold truncate" : "block max-w-full truncate"}>{entry.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(entry.path)}>
                      {entry.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }, [handleNavigate, mediaConfig.input, mediaConfig.label, mediaConfig.name, path, usePageHeader]);

  const headerNode = useMemo(() => (
    <div className="flex items-center justify-between gap-x-2">
      <div className="min-w-0 truncate overflow-hidden">{breadcrumbNode}</div>
      <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
        <MediaHeaderActions
          mediaName={mediaConfig.name}
          path={path}
          onFolderCreate={handleFolderCreate}
        />
      </MediaUpload>
    </div>
  ), [breadcrumbNode, filteredExtensions, handleFolderCreate, handleUpload, mediaConfig.name, path]);

  useOptionalRepoHeader(
    { header: headerNode },
    { enabled: usePageHeader },
  );

  if (!mediaConfig.input) {
    return (
      <Message
        title="No media defined"
        description="You have no media defined in your settings."
        className="absolute inset-0"
        cta="Go to settings"
        href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/settings`}
      />
    );
  }

  if (error) {
    // TODO: should we use a custom error class with code?
    if (path === mediaConfig.input && error === "Not found") {
      return (
        <Message
            title="Media folder missing"
            description={`The media folder "${mediaConfig.input}" has not been created yet.`}
            className="absolute inset-0"
          >
          <EmptyCreate type="media" name={mediaConfig.name}>Create folder</EmptyCreate>
        </Message>
      );
    } else {
      return (
        <Message
          title="Something's wrong..."
          description={error}
          className="absolute inset-0"
        >
          <Button size="sm" onClick={() => handleNavigate(mediaConfig.input)}>Go to media root</Button>
        </Message>
      );
    }
  }

  const mediaGrid = (
    <MediaUpload.DropZone className="flex-1 overflow-auto scrollbar">
      <div className="h-full relative flex flex-col" ref={filesGridRef}>
        {isLoading
          ? loadingSkeleton
          : filteredData && filteredData.length > 0
            ? <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 p-1">
                {filteredData.map((item, index) => 
                  <li key={item.path}>
                    {item.type === "dir"
                      ? <button
                          className="hover:bg-muted focus:ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 outline-none rounded-md block w-full"
                          onClick={() => handleNavigate(item.path)}
                        >
                          <div className="flex items-center justify-center aspect-video">
                            <Folder className="stroke-[0.5] h-[5.5rem] w-[5.5rem]"/>
                          </div>
                          <div className="flex items-center justify-center p-2">
                            <div className="overflow-hidden h-9">
                              <div className="text-sm font-medium truncate">{item.name}</div>
                            </div>
                          </div>
                        </button>
                      : <label htmlFor={`item-${index}`}>
                          {onSelect &&
                            <input 
                              type="checkbox" 
                              id={`item-${index}`} 
                              className="peer sr-only"
                              checked={selected.includes(item.path)}
                              onChange={() => handleSelect(item.path)}
                            />
                          }
                          <div className={onSelect && "hover:bg-muted peer-focus:ring-offset-background peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 rounded-md peer-checked:ring-offset-background peer-checked:ring-offset-2 peer-checked:ring-2 peer-checked:ring-ring relative"}>
                            {imageExtensionsSet.has(item.extension?.toLowerCase())
                              ? <Thumbnail name={mediaConfig.name} path={item.path} className="rounded-t-md aspect-video"/>
                              : <div className="flex items-center justify-center rounded-md aspect-video">
                                  <File className="stroke-[0.5] h-24 w-24"/>
                                </div>
                            }
                            <div className="flex gap-x-2 items-center pt-2">
                              <div className="overflow-hidden mr-auto h-9">
                                <div className="text-sm font-medium truncate">{item.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{getFileSize(item.size)}</div>
                              </div>
                              <FileOptions path={item.path} sha={item.sha} type="media" name={mediaConfig.name} onDelete={handleDelete} onRename={handleRename} portalProps={{container: filesGridRef.current}}>
                                <Button variant="ghost" size="icon-xs" className="shrink-0 self-start">
                                  <EllipsisVertical />
                                </Button>
                              </FileOptions>
                            </div>
                            {onSelect && selected.includes(item.path) &&
                              <div className="text-primary-foreground bg-primary p-0.5 rounded-full absolute top-2 left-2">
                                <Check className="stroke-[3] w-3 h-3"/>
                              </div>
                            }
                          </div>
                        </label>
                    }
                    
                  </li>
                )}
              </ul>
            : <p className="text-muted-foreground flex items-center justify-center text-sm p-6">
                <Ban className="h-4 w-4 mr-2"/>
                This folder is empty.
              </p>
        }
      </div>
    </MediaUpload.DropZone>
  );

  if (!usePageHeader) {
    return (
      <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
        <div className="flex-1 flex flex-col space-y-4">
          <header className="flex items-center gap-x-2 justify-between">
            <div className="sm:flex-1">
              <div className="hidden sm:block min-w-0 truncate overflow-hidden">{breadcrumbNode}</div>
              <Button onClick={handleNavigateParent} size="icon-sm" variant="outline" className="shrink-0 sm:hidden" disabled={!path || path === mediaConfig.input}>
                <CornerLeftUp className="w-4 h-4"/>
              </Button>
            </div>
            <MediaHeaderActions
              mediaName={mediaConfig.name}
              path={path}
              onFolderCreate={handleFolderCreate}
            />
          </header>
          {mediaGrid}
        </div>
      </MediaUpload>
    );
  }

  return (
    <div className="flex-1 flex flex-col space-y-4">
      <MediaUpload media={mediaConfig.name} path={path} onUpload={handleUpload} extensions={filteredExtensions}>
        {mediaGrid}
      </MediaUpload>
    </div>
  );
};

export { MediaView };
