"use client";

import { useRef, isValidElement, cloneElement, useMemo, useCallback, createContext, useContext, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { joinPathSegments } from "@/lib/utils/file";
import { toast } from "sonner";
import { getSchemaByName } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface MediaUploadContextValue {
  handleFiles: (files: FileList) => Promise<void>;
  accept?: string;
  multiple?: boolean;
}

const MediaUploadContext = createContext<MediaUploadContextValue | null>(null);

interface MediaUploadProps {
  children: React.ReactNode;
  path?: string;
  onUpload?: (path: string) => void;
  media?: string;
  extensions?: string[];
  multiple?: boolean;
}

interface MediaUploadTriggerProps {
  children: React.ReactElement<{ onClick?: () => void }>;
}

interface MediaUploadDropZoneProps {
  children: React.ReactNode;
  className?: string;
}

function MediaUploadRoot({ children, path, onUpload, media, extensions, multiple }: MediaUploadProps) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const configMedia = useMemo(() => 
    media
      ? getSchemaByName(config.object, media, "media")
      : config.object.media[0],
    [media, config.object]
  );

  const accept = useMemo(() => {
    if (!configMedia?.extensions && !extensions) return undefined;
    
    const allowedExtensions = extensions 
      ? configMedia?.extensions
        ? extensions.filter(ext => configMedia.extensions.includes(ext))
        : extensions
      : configMedia?.extensions;

    return allowedExtensions?.length > 0
      ? allowedExtensions.map((extension: string) => `.${extension}`).join(",")
      : undefined;
  }, [extensions, configMedia?.extensions]);

  const handleFiles = useCallback(async (files: FileList) => {
    try {
      for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        const file = files[i];

        const uploadPromise = new Promise((resolve, reject) => {
          reader.onload = async () => {
            try {
              const content = (reader.result as string).replace(/^(.+,)/, "");
              const fullPath = joinPathSegments([path ?? "", file.name]);

              const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(fullPath)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "media",
                  name: configMedia.name,
                  content,
                }),
              });

              if (!response.ok) throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);

              const data = await response.json();
              if (data.status !== "success") throw new Error(data.message);
              
              resolve(data);
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
        });

        reader.readAsDataURL(file);

        toast.promise(uploadPromise, {
          loading: `Uploading ${file.name}`,
          success: (data: any) => {
            onUpload?.(data.data);
            return data.message;
          },
          error: (error: any) => error.message,
        });
      }
    } catch (error) {
      console.error(error);
    }
  }, [config, path, configMedia?.name, onUpload]);

  const contextValue = useMemo(() => ({
    handleFiles,
    accept,
    multiple
  }), [handleFiles, accept, multiple]);

  return (
    <MediaUploadContext.Provider value={contextValue}>
      {children}
    </MediaUploadContext.Provider>
  );
}

function MediaUploadTrigger({ children }: MediaUploadTriggerProps) {
  const context = useContext(MediaUploadContext);
  if (!context) throw new Error("MediaUploadTrigger must be used within a MediaUpload component");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const acceptedExtensions = context.accept?.split(',').map(ext => ext.trim().toLowerCase());
    if (acceptedExtensions?.length) {
      const validFiles = Array.from(files).filter(file => {
        const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
        return acceptedExtensions.includes(ext);
      });

      if (validFiles.length === 0) {
        toast.error(`Invalid file type. Allowed: ${context.accept}`);
        return;
      }

      if (validFiles.length !== files.length) {
        toast.error(`Some files were skipped. Allowed: ${context.accept}`);
      }

      context.handleFiles(validFiles as unknown as FileList);
    } else {
      context.handleFiles(files);
    }
  }, [context]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept={context.accept}
        multiple={context.multiple}
        hidden
      />
      {cloneElement(children, { onClick: handleClick })}
    </>
  );
}

function MediaUploadDropZone({ children, className }: MediaUploadDropZoneProps) {
  const context = useContext(MediaUploadContext);
  if (!context) throw new Error("MediaUploadDropZone must be used within a MediaUpload component");
  
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const acceptedExtensions = context.accept?.split(',').map(ext => ext.trim().toLowerCase());
    if (acceptedExtensions?.length) {
      const validFiles = Array.from(files).filter(file => {
        const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
        return acceptedExtensions.includes(ext);
      });

      if (validFiles.length === 0) {
        toast.error(`Invalid file type. Allowed: ${context.accept}`);
        return;
      }

      if (validFiles.length !== files.length) {
        toast.error(`Some files were skipped. Allowed: ${context.accept}`);
      }

      context.handleFiles(validFiles as unknown as FileList);
    } else {
      context.handleFiles(files);
    }
  }, [context]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn("relative", className)}
    >
      {children}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center">
          <p className="text-sm text-foreground font-medium bg-background rounded-full px-3 py-1">
            Drop files here to upload
          </p>
        </div>
      )}
    </div>
  );
}

export const MediaUpload = Object.assign(MediaUploadRoot, {
  Trigger: MediaUploadTrigger,
  DropZone: MediaUploadDropZone,
});