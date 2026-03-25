"use client";

import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { flushSync } from "react-dom";
import { useConfig } from "@/contexts/config-context";
import { MediaView } from "@/components/media/media-view";
import { Button } from "@/components/ui/button";
import type { FileSaveData } from "@/types/api";
import { Loader } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getSchemaByName } from "@/lib/schema";

export interface MediaDialogHandle {
  open: () => void;
  close: () => void;
}

const MediaDialog = forwardRef(({
  media,
  onSubmit,
  maxSelected,
  initialPath,
  children,
  extensions,
  onOpenChange
}: {
  media?: string,
  onSubmit: (images: string[]) => void,
  maxSelected?: number,
  initialPath?: string,
  children?: React.ReactNode,
  extensions?: string[],
  onOpenChange?: (open: boolean) => void
}, ref) => {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const configMedia = media
    ? getSchemaByName(config.object, media, "media")
    : config.object.media[0];

  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelect = useCallback((newSelected: string[]) => {
    setSelectedImages(newSelected);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedImages.length === 0 || isSubmitting) return;
    flushSync(() => {
      setIsSubmitting(true);
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    try {
      await Promise.resolve(onSubmit(selectedImages));
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onSubmit, selectedImages]);

  const handleUpload = useCallback((entry: FileSaveData) => {
    const path = entry.path;
    if (!path) return;
    setSelectedImages((prev) => {
      const next = [...prev, path];
      if (maxSelected == null) return next;
      if (maxSelected <= 0) return [];
      if (next.length <= maxSelected) return next;
      return next.slice(next.length - maxSelected);
    });
  }, [maxSelected]);

  useImperativeHandle(ref, () => ({
    open: () => {
      setSelectedImages([]);
      setIsSubmitting(false);
      setOpen(true);
    },
    close: () => {
      setSelectedImages([]);
      setIsSubmitting(false);
      setOpen(false);
    },
  }));

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return;
    setOpen(nextOpen);
    setSelectedImages([]);
    setIsSubmitting(false);
    onOpenChange?.(nextOpen);
  }, [isSubmitting, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children && 
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      }
      <DialogContent className="w-full sm:max-w-screen-xl sm:w-[calc(100vw-6rem)] h-[calc(100vh-6rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>Select images</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        
        <MediaView 
          media={configMedia.name} 
          extensions={extensions} 
          initialSelected={selectedImages} 
          onSelect={handleSelect} 
          onUpload={handleUpload}
          maxSelected={maxSelected} 
          initialPath={initialPath || ""}
          usePageHeader={false}
        />
        {configMedia.input &&
          <DialogFooter>
            <Button 
              type="button" 
              onClick={() => void handleSubmit()} 
              disabled={selectedImages.length === 0 || isSubmitting}
            >
              Select
              {isSubmitting ? <Loader className="animate-spin" /> : null}
            </Button>
          </DialogFooter>
        }
      </DialogContent>
    </Dialog>
  );
});

MediaDialog.displayName = "MediaDialog";

export { MediaDialog };
