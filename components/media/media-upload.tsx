"use client";

import { useRef, isValidElement, cloneElement, useMemo, useCallback } from "react";
import { useConfig } from "@/contexts/config-context";
import { joinPathSegments } from "@/lib/utils/file";
import { toast } from "sonner";
import { getSchemaByName } from "@/lib/schema";

const MediaUpload = ({
  children,
  path,
  onUpload,
  media,
  extensions
}: {
  children: React.ReactElement<{ onClick: () => void }>;
  path?: string;
  onUpload?: (path: string) => void;
  media?: string;
  extensions?: string[];
}) => {
  const fileInputRef = useRef(null);

  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const configMedia = useMemo(() => 
    media
      ? getSchemaByName(config.object, media, "media")
      : config.object.media[0],
    [media, config.object]
  );

  const mediaExtensions = configMedia.extensions;

  const accept = useMemo(() => {
    if (!configMedia?.extensions) return undefined;
    
    const allowedExtensions = extensions 
      ? extensions.filter(ext => configMedia.extensions.includes(ext))
      : configMedia.extensions;

    return allowedExtensions.length > 0
      ? allowedExtensions.map(extension => `.${extension}`).join(",")
      : undefined;
  }, [extensions, configMedia?.extensions]);

  const handleFileInput = useCallback(async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const readFileContent = (file: File): Promise<string | null> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file content"));
        reader.readAsDataURL(file); // Reads the file as base64 encoded string
      });
    };

    const files = event.target.files;
    
    if (files && files.length > 0) {
      try {
        for (let i = 0; i < files.length; i++) {
          let content = await readFileContent(files[i]);
          
          if (content) {
            content = content.replace(/^(.+,)/, ""); // We strip out the info at the beginning of the file (mime type + encoding)
            const fullPath = joinPathSegments([path ?? "", files[i].name]);

            const uploadPromise = new Promise(async (resolve, reject) => {
              try {
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

                const data: any = await response.json();
                
                if (data.status !== "success") throw new Error(data.message);
                
                resolve(data);
              } catch (error) {
                reject(error);
              }
            });

            toast.promise(uploadPromise, {
              loading: `Uploading ${files[i].name}`,
              success: (response: any) => {
                onUpload?.(response.data);
                return response.message;
              },
              error: (error: any) => error.message,
            });
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
  }, [config, path, configMedia.name, onUpload]);

  const handleTriggerClick = useCallback(() => {
    if (fileInputRef.current) {
      (fileInputRef.current as HTMLInputElement).click();
    }
  }, []);

  const trigger = useMemo(() => 
    isValidElement(children)
      ? cloneElement(children, { onClick: handleTriggerClick })
      : null,
    [children, handleTriggerClick]
  );

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept={accept}
        multiple
        hidden
      />
      {trigger}
    </>
  );
};

export { MediaUpload };