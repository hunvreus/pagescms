"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import {
  extensionCategories,
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
import { cn } from "@/lib/utils";
import { requireApiSuccess } from "@/lib/api-client";
import type { ApiResponse, FileSaveData, MediaItem } from "@/types/api";
import useSWR, { useSWRConfig } from "swr";
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
  onFolderCreate: (entry: unknown) => void;
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

type MediaFolderTileProps = {
  item: MediaItem;
  onNavigate: (path: string) => void;
};

const MediaFolderTile = memo(function MediaFolderTile({ item, onNavigate }: MediaFolderTileProps) {
  return (
    <button
      className="hover:bg-muted focus:ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 outline-none rounded-md block w-full"
      onClick={() => onNavigate(item.path)}
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
  );
});

type MediaFileTileProps = {
  item: MediaItem;
  mediaName: string;
  selectable: boolean;
  isSelected: boolean;
  isImage: boolean;
  displaySize: string;
  portalContainer: HTMLDivElement | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newPath: string) => void;
};

const MediaFileTile = memo(function MediaFileTile({
  item,
  mediaName,
  selectable,
  isSelected,
  isImage,
  displaySize,
  portalContainer,
  onSelect,
  onDelete,
  onRename,
}: MediaFileTileProps) {
  const content = (
    <div className={cn(
      "relative rounded-md",
      selectable && "hover:bg-muted peer-focus:ring-offset-background peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 peer-checked:ring-offset-background peer-checked:ring-offset-2 peer-checked:ring-2 peer-checked:ring-ring",
    )}>
      {isImage
        ? <Thumbnail name={mediaName} path={item.path} className="rounded-t-md aspect-video"/>
        : <div className="flex items-center justify-center rounded-md aspect-video">
            <File className="stroke-[0.5] h-24 w-24"/>
          </div>
      }
      <div className="flex gap-x-2 items-center pt-2">
        <div className="overflow-hidden mr-auto h-9">
          <div className="text-sm font-medium truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground truncate">{displaySize}</div>
        </div>
        <FileOptions
          path={item.path}
          sha={item.sha || ""}
          type="media"
          name={mediaName}
          onDelete={onDelete}
          onRename={onRename}
          portalProps={{ container: portalContainer }}
        >
          <Button variant="ghost" size="icon-xs" className="shrink-0 self-start">
            <EllipsisVertical />
          </Button>
        </FileOptions>
      </div>
      {selectable && isSelected && (
        <div className="text-primary-foreground bg-primary p-0.5 rounded-full absolute top-2 left-2">
          <Check className="stroke-[3] w-3 h-3"/>
        </div>
      )}
    </div>
  );

  if (!selectable) return content;

  return (
    <label>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={isSelected}
        onChange={() => onSelect(item.path)}
      />
      {content}
    </label>
  );
});

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
  onUpload?: (entry: FileSaveData) => void,
  extensions?: string[],
  usePageHeader?: boolean,
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);
  const { mutate } = useSWRConfig();

  const mediaConfig = useMemo(() => {
    if (!media) return config.object.media[0];
    return config.object.media.find((item: { name: string }) => item.name === media);
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
  const [data, setData] = useState<MediaItem[] | undefined>(undefined);
  
  // Filter the data based on filteredExtensions when displaying
  const filteredData = useMemo(() => {
    if (!data) return undefined;
    if (filteredExtensionsSet.size === 0) return data;
    return data.filter(item => 
      item.type === "dir" ||
      filteredExtensionsSet.has(item.extension?.toLowerCase())
    );
  }, [data, filteredExtensionsSet]);

  const sortMediaItems = useCallback((items: MediaItem[]) => {
    return [...items].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });
  }, []);
  
  const buildMediaApiUrl = useCallback((targetPath: string): string => (
    `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${encodeURIComponent(mediaConfig.name)}/${encodeURIComponent(targetPath)}`
  ), [config.branch, config.owner, config.repo, mediaConfig.name]);

  const mediaKey = useMemo(() => buildMediaApiUrl(path), [buildMediaApiUrl, path]);
  const fetchMediaByUrl = useCallback(async (apiUrl: string): Promise<MediaItem[]> => {
    const response = await fetch(apiUrl);
    const payload = await requireApiSuccess<any>(
      response,
      "Failed to fetch media",
    );
    return payload.data as MediaItem[];
  }, []);

  const {
    data: swrMediaData,
    error: swrMediaError,
    isLoading: swrMediaLoading,
  } = useSWR<MediaItem[]>(
    mediaKey,
    fetchMediaByUrl,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );

  useEffect(() => {
    if (!swrMediaData) return;
    setData(swrMediaData);
    setError(null);
  }, [swrMediaData]);

  useEffect(() => {
    if (!swrMediaError) return;
    const message = swrMediaError instanceof Error ? swrMediaError.message : "Failed to fetch media.";
    setError(message);
  }, [swrMediaError]);

  const isLoading = swrMediaLoading && !data;

  const handleUpload = useCallback((entry: FileSaveData) => {
    if (!entry.path || !entry.name) return;
    const mediaEntry: MediaItem = {
      type: "file",
      sha: entry.sha,
      name: entry.name,
      path: entry.path,
      extension: entry.extension,
      size: entry.size,
      url: entry.url,
    };

    setData((prevData) => {
      if (!prevData) return [mediaEntry];

        const existingIndex = prevData.findIndex((item) => item.path === mediaEntry.path);
        if (existingIndex >= 0) {
          const next = [...prevData];
          next[existingIndex] = { ...next[existingIndex], ...mediaEntry };
          return sortMediaItems(next);
        }

        return sortMediaItems([...prevData, mediaEntry]);
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
    onUpload?.(entry);
  }, [mediaConfig.name, mutate, onUpload, sortMediaItems]);

  const handleDelete = useCallback((deletedPath: string) => {
    setData((prevData) => {
      if (!prevData) return prevData;
      const next = prevData.filter((item) => item.path !== deletedPath);
      return next.length === prevData.length ? prevData : next;
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate]);

  const handleRename = useCallback((oldPath: string, newPath: string) => {
    setData((prevData) => {
      if (!prevData || oldPath === newPath) return prevData;

      if (getParentPath(normalizePath(oldPath)) === getParentPath(normalizePath(newPath))) {
        let changed = false;
        const next = prevData.map((item) => {
          if (item.path !== oldPath) return item;
          changed = true;
          return { ...item, path: newPath, name: getFileName(newPath) };
        });
        return changed ? sortMediaItems(next) : prevData;
      }

      const next = prevData.filter((item) => item.path !== oldPath);
      return next.length === prevData.length ? prevData : next;
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate, sortMediaItems]);

  const handleFolderCreate = useCallback((entry: unknown) => {
    const createdPath = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && "path" in entry
        ? (entry as { path?: string }).path
        : undefined;

    if (!createdPath) return;

    const parentPath = getParentPath(createdPath);
    if (!parentPath) return;

    const parent: MediaItem = {
      type: "dir",
      name: getFileName(parentPath),
      path: parentPath,
      size: 0,
      url: null,
    };
    
    setData((prevData) => {
      if (!prevData) return [parent];
      if (prevData.some((item) => item.path === parent.path && item.type === "dir")) {
        return prevData;
      }
      return sortMediaItems([...prevData, parent]);
    });
    void mutate((key) => typeof key === "string" && key.includes(`/media/${encodeURIComponent(mediaConfig.name)}/`));
  }, [mediaConfig.name, mutate, sortMediaItems]);

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
      const isSelected = prevSelected.includes(path);
      if (isSelected) {
        return prevSelected.filter((item) => item !== path);
      }

      const nextSelected = [...prevSelected, path];
      if (maxSelected == null) return nextSelected;
      if (maxSelected <= 0) return [];
      if (nextSelected.length <= maxSelected) return nextSelected;

      return nextSelected.slice(nextSelected.length - maxSelected);
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
        cta="Go to configuration"
        href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/configuration`}
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

  const selectedPaths = useMemo(() => new Set(selected), [selected]);

  const gridItems = useMemo(() => {
    if (!filteredData) return [];

    return filteredData.map((item) => ({
      item,
      isImage: item.type === "file" && imageExtensionsSet.has((item.extension || "").toLowerCase()),
      displaySize: item.type === "file" && typeof item.size === "number" ? getFileSize(item.size) : "",
    }));
  }, [filteredData, imageExtensionsSet]);

  const mediaGrid = (
    <MediaUpload.DropZone className="flex-1 overflow-auto scrollbar">
      <div className="h-full relative flex flex-col" ref={filesGridRef}>
        {isLoading
          ? loadingSkeleton
          : gridItems.length > 0
            ? <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 p-1">
                {gridItems.map(({ item, isImage, displaySize }) => 
                  <li key={item.path}>
                    {item.type === "dir"
                      ? <MediaFolderTile item={item} onNavigate={handleNavigate} />
                      : <MediaFileTile
                          item={item}
                          mediaName={mediaConfig.name}
                          selectable={!!onSelect}
                          isSelected={selectedPaths.has(item.path)}
                          isImage={isImage}
                          displaySize={displaySize}
                          portalContainer={filesGridRef.current}
                          onSelect={handleSelect}
                          onDelete={handleDelete}
                          onRename={handleRename}
                        />
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
