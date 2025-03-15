"use client";

import { forwardRef, useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MediaUpload } from "@/components/media/media-upload";
import { Pencil, Trash2, Upload, File, FileText, FileVideo, FileImage, FileAudio, FileArchive, FileCode, FileType, FileSpreadsheet, GripVertical } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { getFileExtension, getFileName, extensionCategories } from "@/lib/utils/file";
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

const SortableItem = ({ file, onRemove, getFileIcon }: { 
  file: string;
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
  } = useSortable({ id: file });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative' as const
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-4 py-2 border rounded-md bg-background">
        <div {...attributes} {...listeners} className="-ml-2">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        </div>
        {getFileIcon(file)}
        <div className="overflow-hidden">
          <div className="font-medium truncate">{getFileName(file)}</div>
          <div className="text-xs text-muted-foreground truncate">{file}</div>
        </div>

        <div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(file)}
                  className="h-8 w-8 p-0"
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
      </div>
    </div>
  );
};

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;
  const { config } = useConfig();

  const [files, setFiles] = useState<string[]>(() => 
    value
      ? Array.isArray(value)
        ? value
        : [value]
      : []
  );

  const isMultiple = field.options?.multiple !== undefined && field.options?.multiple !== false;
  const uploadPath = field.options?.path || config?.object.media?.input;

  useEffect(() => {
    if (isMultiple) {
      onChange(files);
    } else {
      onChange(files[0] || undefined);
    }
  }, [files, isMultiple, onChange]);

  const handleUpload = useCallback((fileData: any) => {
    if (!config) return;
    
    const path = fileData.path;
    
    if (isMultiple) {
      setFiles(prev => [...prev, path]);
    } else {
      setFiles([path]);
    }
  }, [isMultiple, config]);

  const handleRemove = useCallback((pathToRemove: string) => {
    console.log("handleRemove", pathToRemove);
    setFiles(prev => prev.filter(path => path !== pathToRemove));
  }, []);

  const getFileIcon = (filePath: string) => {
    const ext = getFileExtension(filePath);
    for (const [category, extensions] of Object.entries(extensionCategories)) {
      if (extensions.includes(ext)) {
        switch (category) {
          case 'image':
            return <FileImage className="h-10 w-10 stroke-[1]" />;
          case 'document':
            return <FileText className="h-10 w-10 stroke-[1]" />;
          case 'video':
            return <FileVideo className="h-10 w-10 stroke-[1]" />;
          case 'audio':
            return <FileAudio className="h-10 w-10 stroke-[1]" />;
          case 'compressed':
            return <FileArchive className="h-10 w-10 stroke-[1]" />;
          case 'code':
            return <FileCode className="h-10 w-10 stroke-[1]" />;
          case 'font':
            return <FileType className="h-10 w-10 stroke-[1]" />;
          case 'spreadsheet':
            return <FileSpreadsheet className="h-10 w-10 stroke-[1]" />;
          default:
            return <FileText className="h-10 w-10 stroke-[1]" />;
        }
      }
    }
    return <File className="h-10 w-10 stroke-[1]" />;
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
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={files}
            strategy={verticalListSortingStrategy}
          >
            {files.map((file) => (
              <SortableItem 
                key={file} 
                file={file} 
                onRemove={handleRemove}
                getFileIcon={getFileIcon}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      
      {(!files.length || isMultiple) && (
        <MediaUpload path={uploadPath} onUpload={handleUpload}>
          <Button type="button" size="sm" className="gap-2">
            <Upload className="h-3.5 w-3.5"/>
            Upload
          </Button>
        </MediaUpload>
      )}
    </div>
  );
});

EditComponent.displayName = "EditComponent";

export { EditComponent };