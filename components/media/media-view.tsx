"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import {
  extensionCategories,
  sortFiles,
  getFileSize,
  getParentPath,
  getFileName,
  normalizePath
} from "@/lib/utils/file";
import { EmptyCreate } from "@/components/empty-create";
import { FolderCreate} from "@/components/folder-create";
import { FileOptions } from "@/components/file-options";
import { PathBreadcrumb } from "@/components/path-breadcrumb";
import { MediaUpload} from "./media-upload";
import { Message } from "@/components/message";
import { Thumbnail } from "@/components/thumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CornerLeftUp,
  Ban,
  Check,
  EllipsisVertical,  
  File,
  Folder,
  FolderPlus,
  Upload
} from "lucide-react";

const MediaView = ({
  initialPath,
  initialSelected,
  maxSelected,
  onSelect,
}: {
  initialPath?: string,
  initialSelected?: string[],
  maxSelected?: number,
  onSelect?: (newSelected: string[]) => void
}) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  
  const filesGridRef = useRef<HTMLDivElement | null>(null);

  const [error, setError] = useState<string | null | undefined>(null);
  const [selected, setSelected] = useState(initialSelected || []);
  const [path, setPath] = useState(() => {
    if (!config.object.media) return "";
    if (!initialPath) return config.object.media.input;
    const normalizedInitialPath = normalizePath(initialPath);
    if (normalizedInitialPath.startsWith(config.object.media.input)) return normalizedInitialPath;
    console.warn(`"${initialPath}" is not within media root "${config.object.media.input}". Defaulting to media root.`);
    return config.object.media.input;
  });
  const [data, setData] = useState<Record<string, any>[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    async function fetchMedia() {
      if (config) {
        setIsLoading(true);
        setError(null);

        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${encodeURIComponent(path)}`);
          if (!response.ok) throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);

          const data: any = await response.json();
          
          if (data.status !== "success") throw new Error(data.message);
          
          setData(data.data);
        } catch (error: any) {
          console.error(error);
          setError(error.message);
        } finally {
          setIsLoading(false);
        }
      }
    }
    fetchMedia();
    
  }, [config, path]);

  const handleUpload = useCallback((entry: any) => {
    setData((prevData) => {
      if (!prevData) return [entry];
      return sortFiles([...prevData, entry]);
    });
  }, []);

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

  const handleNavigate = (newPath: string) => {
    setPath(newPath);
    if (!onSelect) {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("path", newPath || config?.object.media.input);
      router.push(`${pathname}?${params.toString()}`);
    }
  }

  const handleNavigateParent = () => {
    if (!path || path === config.object.media.input) return;
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
      
      if (onSelect) onSelect(newSelected);
      
      return newSelected;
    });
  }, [onSelect, maxSelected]);

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
            <Button variant="ghost" size="icon" className="shrink-0 ml-auto" disabled>
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  ), []);

  if (!config.object.media?.input) {
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
    if (path === config.object.media.input && error === "Not found") {
      return (
        <Message
            title="Media folder missing"
            description={`The media folder "${config.object.media.input}" has not been created yet.`}
            className="absolute inset-0"
          >
          <EmptyCreate type="media">Create folder</EmptyCreate>
        </Message>
      );
    } else {
      return (
        <Message
          title="Something's wrong..."
          description={error}
          className="absolute inset-0"
        >
          <Button size="sm" onClick={() => handleNavigate(config.object.media.input)}>Go to media root</Button>
        </Message>
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col space-y-4">
      <header className="flex items-center gap-x-2">
        <div className="sm:flex-1">
          <PathBreadcrumb path={path} rootPath={config.object.media.input} handleNavigate={handleNavigate} className="hidden sm:block"/>
          <Button onClick={handleNavigateParent} size="icon-sm" variant="outline" className="shrink-0 sm:hidden" disabled={!path || path === config.object.media.input}>
            <CornerLeftUp className="w-4 h-4"/>
          </Button>
        </div>
        <FolderCreate path={path} type="media" onCreate={handleFolderCreate}>
          <Button type="button" variant="outline" className="ml-auto" size="icon-sm">
            <FolderPlus className="h-3.5 w-3.5"/>
          </Button>
        </FolderCreate>
        <MediaUpload path={path} onUpload={handleUpload}>
          <Button type="button" size="sm" className="gap-2">
            <Upload className="h-3.5 w-3.5"/>
            Upload
          </Button>
        </MediaUpload>
      </header>
      <div className="relative flex-1 overflow-auto scrollbar" ref={filesGridRef}>
        {isLoading
          ? loadingSkeleton
          : data && data.length > 0
              ? <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 p-1">
                  {data.map((item, index) => 
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
                              {extensionCategories.image.includes(item.extension)
                                ? <Thumbnail path={item.path} className="rounded-t-md aspect-video"/>
                                : <div className="flex items-center justify-center rounded-md aspect-video">
                                    <File className="stroke-[0.5] h-24 w-24"/>
                                  </div>
                              }
                              <div className="flex gap-x-2 items-center p-2">
                                <div className="overflow-hidden mr-auto h-9">
                                  <div className="text-sm font-medium truncate">{item.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{getFileSize(item.size)}</div>
                                </div>
                                <FileOptions path={item.path} sha={item.sha} type="media" onDelete={handleDelete} onRename={handleRename} portalProps={{container: filesGridRef.current}}>
                                  <Button variant="ghost" size="icon" className="shrink-0">
                                    <EllipsisVertical className="h-4 w-4" />
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
    </div>
  )
};

export { MediaView };