"use client";

import { forwardRef, useCallback, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MediaUpload } from "@/components/media/media-upload";
import { MediaDialog } from "@/components/media/media-dialog";
import { Trash2, Upload, File, FileText, FileVideo, FileImage, FileAudio, FileArchive, FileCode, FileType, FileSpreadsheet, GripVertical, FolderOpen, ArrowUpRight } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { getFileExtension, getFileName, extensionCategories, normalizePath } from "@/lib/utils/file";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import { getSchemaByName } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const generateId = () => uuidv4().slice(0, 8);

const FileTeaser = ({ file, config, onRemove, getFileIcon }: { 
  file: string;
  config: any;
  onRemove: (file: string) => void;
  getFileIcon: (file: string) => React.ReactNode;
}) => {
  return (
    <>
      <div className="flex items-center overflow-hidden">
        {getFileIcon(file)}
        <span className="ml-1 font-medium whitespace-nowrap">{getFileName(file)}</span>
        <span className="ml-2 text-muted-foreground truncate">{file}</span>
      </div>

      <div className="flex items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${file}`}
                target="_blank"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "text-muted-foreground hover:text-foreground transition-colors")}
              >
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>
              See on GitHub
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(file)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Remove
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  )
};

const SortableItem = ({ id, file, config, onRemove, getFileIcon }: { 
  id: string;
  file: string;
  config: any;
  onRemove: (file: string) => void;
  getFileIcon: (file: string) => React.ReactNode;
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
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pl-2 pr-1 bg-muted rounded-md h-10">
        <div
          {...attributes} {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <FileTeaser file={file} config={config} onRemove={onRemove} getFileIcon={getFileIcon} />
      </div>
    </div>
  );
};

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;
  const { config } = useConfig();
  
  const [files, setFiles] = useState<Array<{ id: string, path: string }>>(() => 
    value
      ? Array.isArray(value)
        ? value.map(path => ({ id: generateId(), path }))
        : [{ id: generateId(), path: value }]
      : []
  );

  const mediaConfig = useMemo(() => {
    if (!config?.object?.media?.length) {
      return undefined;
    }
    return field.options?.media
      ? getSchemaByName(config.object, field.options?.media, "media")
      : config.object.media[0];
  }, [field.options?.media, config?.object]);

  const rootPath = useMemo(() => {
    if (!field.options?.path) {
      return mediaConfig?.input;
    }

    const normalizedPath = normalizePath(field.options.path);
    const normalizedMediaPath = normalizePath(mediaConfig?.input);

    if (!normalizedPath.startsWith(normalizedMediaPath)) {
      console.warn(`"${field.options.path}" is not within media root "${mediaConfig?.input}". Defaulting to media root.`);
      return mediaConfig?.input;
    }

    return normalizedPath;
  }, [field.options?.path, mediaConfig?.input]);

  const allowedExtensions = useMemo(() => {
    if (!mediaConfig) return [];

    const fieldExtensions = field.options?.extensions 
      ? field.options.extensions
      : field.options?.categories
        ? field.options.categories.flatMap((category: string) => extensionCategories[category])
        : [];

    if (!fieldExtensions.length) return mediaConfig.extensions || [];

    return mediaConfig.extensions
      ? fieldExtensions.filter((ext: string) => mediaConfig.extensions.includes(ext))
      : fieldExtensions;
  }, [field.options?.extensions, field.options?.categories, mediaConfig]);

  const isMultiple = useMemo(() => 
    field.options?.multiple === true,
    [field.options?.multiple]
  );

  const remainingSlots = useMemo(() => 
    field.options?.multiple
      ? field.options.multiple.max
        ? field.options.multiple.max - files.length
        : Infinity
      : 1 - files.length,
    [field.options?.multiple, files.length]
  );

  useEffect(() => {
    if (isMultiple) {
      onChange(files.map(f => f.path));
    } else {
      onChange(files[0]?.path || undefined);
    }
  }, [files, isMultiple, onChange]);

  const handleUpload = useCallback((fileData: any) => {
    if (!config) return;
    
    const newFile = { id: generateId(), path: fileData.path };
    
    if (isMultiple) {
      setFiles(prev => [...prev, newFile]);
    } else {
      setFiles([newFile]);
    }
  }, [isMultiple, config]);

  const handleRemove = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(file => file.id !== fileId));
  }, []);

  const getFileIcon = (filePath: string) => {
    const ext = getFileExtension(filePath);
    for (const [category, extensions] of Object.entries(extensionCategories)) {
      if (extensions.includes(ext)) {
        switch (category) {
          case 'image':
            return <FileImage className="h-4 w-4 shrink-0" />;
          case 'document':
            return <FileText className="h-4 w-4 shrink-0" />;
          case 'video':
            return <FileVideo className="h-4 w-4 shrink-0" />;
          case 'audio':
            return <FileAudio className="h-4 w-4 shrink-0" />;
          case 'compressed':
            return <FileArchive className="h-4 w-4 shrink-0" />;
          case 'code':
            return <FileCode className="h-4 w-4 shrink-0" />;
          case 'font':
            return <FileType className="h-4 w-4 shrink-0" />;
          case 'spreadsheet':
            return <FileSpreadsheet className="h-4 w-4 shrink-0" />;
          default:
            return <FileText className="h-4 w-4 shrink-0" />;
        }
      }
    }
    return <File className="h-4 w-4" />;
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

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
        href={`/${config?.owner}/${config?.repo}/${encodeURIComponent(config?.branch || "")}/settings`}
        className="underline hover:text-foreground"
      >
        Check your settings
      </a>.
    </p>
    );
  }

  return (
    <MediaUpload path={rootPath} media={mediaConfig.name} extensions={allowedExtensions} onUpload={handleUpload} multiple={isMultiple}>
      <MediaUpload.DropZone>
        <div className="space-y-2">
          {files.length > 0 && (
            isMultiple ? (
              <div className="space-y-2">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={files.map(f => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {files.map((file) => (
                      <SortableItem 
                        key={file.id}
                        id={file.id}
                        file={file.path}
                        config={config}
                        onRemove={() => handleRemove(file.id)}
                        getFileIcon={getFileIcon}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto] items-center gap-2 pl-3 pr-1 bg-muted rounded-md h-10">
                <FileTeaser file={files[0].path} config={config} onRemove={() => handleRemove(files[0].id)} getFileIcon={getFileIcon} />
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
              <TooltipProvider>
                <Tooltip>
                  <MediaDialog
                    media={mediaConfig.name}
                    initialPath={rootPath}
                    maxSelected={remainingSlots}
                    extensions={allowedExtensions}
                    onSubmit={handleSelected}
                  >
                    <TooltipTrigger asChild>
                      <Button type="button" size="icon-sm" variant="outline">
                        <FolderOpen className="h-3.5 w-3.5"/>
                      </Button>
                    </TooltipTrigger>
                  </MediaDialog>
                  <TooltipContent>
                    Select from media
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </MediaUpload.DropZone>
    </MediaUpload>
  );
});

EditComponent.displayName = "EditComponent";

export { EditComponent };