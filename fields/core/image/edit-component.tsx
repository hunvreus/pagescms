"use client";

import { forwardRef, useCallback, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MediaUpload } from "@/components/media/media-upload";
import { MediaDialog } from "@/components/media/media-dialog";
import { Upload, FolderOpen, ArrowUpRight, EllipsisVertical } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { normalizePath } from "@/lib/utils/file";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getSchemaByName } from "@/lib/schema";
import { Thumbnail } from "@/components/thumbnail";
import { getAllowedExtensions } from "./index";
import type { Config } from "@/types/config";
import type { Field } from "@/types/field";
import type { FileSaveData } from "@/types/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const generateId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

type FileEntry = {
  id: string;
  path: string;
};

type MediaSchema = {
  name: string;
  input: string;
  extensions?: string[];
};

type EditorProps = {
  value?: string | string[] | null;
  field: Field;
  onChange: (value: string | string[]) => void;
};

type FieldOptions = {
  media?: false | string;
  path?: string;
  multiple?: boolean | { max?: number };
};

const ImageTeaser = ({ file, config, onRemove }: { 
  file: string;
  config: Pick<Config, "owner" | "repo" | "branch">;
  onRemove: () => void;
}) => {
  return (
    <>
      <div className="absolute bottom-1 right-1 bg-background rounded-md">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a
                href={`https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${file}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                View on GitHub
                <ArrowUpRight className="size-3 ml-auto" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={onRemove}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
};

const SortableItem = ({ id, file, config, media, onRemove }: { 
  id: string;
  file: string;
  config: Pick<Config, "owner" | "repo" | "branch">;
  media: string;
  onRemove: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners}>
        <Thumbnail name={media} path={file} className="rounded-md w-28 h-28"/>
      </div>
      <ImageTeaser file={file} config={config} onRemove={onRemove} />
    </div>
  );
};

const EditComponent = forwardRef((props: EditorProps, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;
  void ref;
  const { config } = useConfig();
  if (!config) throw new Error("Configuration not found.");
  const options = (field.options ?? {}) as FieldOptions;
  
  const [files, setFiles] = useState<FileEntry[]>(() => 
    typeof value === "string"
      ? [{ id: generateId(), path: value }]
      : Array.isArray(value)
        ? value.filter((path): path is string => typeof path === "string").map((path) => ({ id: generateId(), path }))
        : []
  );

  const mediaConfig = useMemo<MediaSchema | undefined>(() => {
    return (config.object?.media?.length && options.media !== false)
      ? options.media && typeof options.media === 'string'
        ? getSchemaByName(config.object, options.media, "media") as MediaSchema | undefined
        : config.object.media[0] as MediaSchema
      : undefined;
  }, [config.object, options.media]);

  const rootPath = useMemo(() => {
    if (!options.path) {
      return mediaConfig?.input;
    }

    const mediaRoot = mediaConfig?.input;
    if (!mediaRoot) {
      return normalizePath(options.path);
    }

    const normalizedPath = normalizePath(options.path);
    const normalizedMediaPath = normalizePath(mediaRoot);

    if (!normalizedPath.startsWith(normalizedMediaPath)) {
      console.warn(`"${options.path}" is not within media root "${mediaRoot}". Defaulting to media root.`);
      return mediaRoot;
    }

    return normalizedPath;
  }, [options.path, mediaConfig?.input]);

  const allowedExtensions = useMemo(() => {
    if (!mediaConfig) return [];
    return getAllowedExtensions(field, mediaConfig);
  }, [field, mediaConfig]);

  const isMultiple = useMemo(() => 
    !!options.multiple,
    [options.multiple]
  );

  const remainingSlots = useMemo(() => 
    options.multiple
      ? (typeof options.multiple === "object" && options.multiple !== null && typeof options.multiple.max === "number")
        ? options.multiple.max - files.length
        : Infinity
      : 1 - files.length,
    [options.multiple, files.length]
  );

  useEffect(() => {
    if (isMultiple) {
      onChange(files.map(f => f.path));
    } else {
      onChange(files[0]?.path ?? "");
    }
  }, [files, isMultiple, onChange]);

  const handleUpload = useCallback((fileData: FileSaveData) => {
    if (!fileData.path) return;
    
    const newFile = { id: generateId(), path: fileData.path };
    
    if (isMultiple) {
      setFiles(prev => [...prev, newFile]);
    } else {
      setFiles([newFile]);
    }
  }, [isMultiple]);

  const handleRemove = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(file => file.id !== fileId));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSelected = useCallback((newPaths: string[]) => {
    if (newPaths.length === 0) {
      setFiles([]);
    } else {
      const newFiles = newPaths.map(path => ({
        id: generateId(),
        path
      }));
      
      if (isMultiple) {
        setFiles(prev => [...prev, ...newFiles]);
      } else {
        setFiles([newFiles[0]]);
      }
    }
  }, [isMultiple]);

  if (!mediaConfig) {
    return (
      <p className="text-muted-foreground bg-muted rounded-md px-3 py-2">
      No media configuration found. {' '}
      <a 
        href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch || "")}/settings`}
        className="underline hover:text-foreground"
      >
        Check your settings
      </a>.
    </p>
    );
  }

  return (
    <MediaUpload path={rootPath} media={mediaConfig.name} extensions={allowedExtensions || undefined} onUpload={handleUpload} multiple={isMultiple}>
      <MediaUpload.DropZone>
        <div className="space-y-2">
          {files.length > 0 && (
            isMultiple ? (
              <div className="flex flex-wrap gap-2">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={files.map(f => f.id)}
                    strategy={rectSortingStrategy}
                  >
                    {files.map((file) => (
                      <SortableItem 
                        key={file.id}
                        id={file.id}
                        file={file.path}
                        config={config}
                        media={mediaConfig.name}
                        onRemove={() => handleRemove(file.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            ) : (
              <div className="aspect-square w-28 relative">
                <Thumbnail name={mediaConfig.name} path={files[0].path} className="rounded-md w-28 h-28"/>
                <ImageTeaser file={files[0].path} config={config} onRemove={() => handleRemove(files[0].id)} />
              </div>
            )
          )}
          {remainingSlots > 0 && (
            <div className="flex gap-2">
              <MediaUpload.Trigger>
                <Button type="button" size="sm" variant="outline" className="gap-2">
                  <Upload className="h-3.5 w-3.5"/>
                  Upload
                </Button>
              </MediaUpload.Trigger>
              <MediaDialog
                media={mediaConfig.name}
                initialPath={rootPath}
                maxSelected={remainingSlots}
                extensions={allowedExtensions}
                selected={files.map((file) => file.path)}
                onSubmit={handleSelected}
              >
                  <Button type="button" size="sm" variant="outline">
                    <FolderOpen />
                    Select
                  </Button>
              </MediaDialog>
            </div>
          )}
        </div>
      </MediaUpload.DropZone>
    </MediaUpload>
  );
});

EditComponent.displayName = "EditComponent";

export { EditComponent };
