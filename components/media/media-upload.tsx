"use client";

import { useRef, isValidElement, cloneElement } from "react";
import { useConfig } from "@/contexts/config-context";
import { joinPathSegments } from "@/lib/utils/file";
import { toast } from "sonner";

const MediaUpload = ({
  children,
  path,
  onUpload,
}: {
  children: React.ReactElement<{ onClick: () => void }>;
  path?: string;
  onUpload?: (path: string) => void;
}) => {
  const fileInputRef = useRef(null);

  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const handleTriggerClick = () => {
    if (fileInputRef.current) {
      (fileInputRef.current as HTMLInputElement).click();
    }
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
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
  };
  
  const trigger = isValidElement(children)
    ? cloneElement(children, { onClick: handleTriggerClick })
    : null;

  const mediaExtensions = config?.object.media?.extensions;
  const accept = mediaExtensions && mediaExtensions.length > 0
    ? mediaExtensions.map((extension: string) => `.${extension}`).join(",")
    : undefined;

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