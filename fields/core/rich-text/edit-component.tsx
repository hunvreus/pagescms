"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Editor } from "@/components/ui/editor";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MediaDialog,
  type MediaDialogHandle,
} from "@/components/media/media-dialog";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { getSchemaByName } from "@/lib/schema";
import {
  getRawUrl,
  getRelativeUrl,
  htmlSwapPrefix,
  rawToRelativeUrls,
  relativeToRawUrls,
  swapPrefix,
} from "@/lib/githubImage";
import {
  extensionCategories,
  getFileExtension,
  joinPathSegments,
  normalizePath,
} from "@/lib/utils/file";
import type { ApiResponse, FileSaveData } from "@/types/api";
import "./edit-component.css";

type MediaSchema = {
  name: string;
  input: string;
  output: string;
  extensions?: string[];
};

type FieldOptions = {
  format?: "html" | "markdown";
  switcher?: boolean;
  media?: false | string;
  path?: string;
  extensions?: string[];
  categories?: string[];
};

type EditProps = {
  name?: string;
  value?: string;
  field?: {
    options?: FieldOptions;
  };
  labelSlotId?: string;
  registerBeforeSubmitHook?: (
    key: string,
    hook: () => void | Promise<void>,
  ) => () => void;
  onChange: (value: string) => void;
};

const isExternalUrl = (value: string) =>
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.startsWith("//");

const isDataUrl = (value: string) => value.startsWith("data:");
const isAbsolutePath = (value: string) => value.startsWith("/");

const parseMarkdownTarget = (
  target: string,
): { url: string; rest: string; wrapped: boolean } => {
  const trimmed = target.trim();
  if (trimmed.startsWith("<")) {
    const closingIndex = trimmed.indexOf(">");
    if (closingIndex > 0) {
      return {
        url: trimmed.slice(1, closingIndex),
        rest: trimmed.slice(closingIndex + 1),
        wrapped: true,
      };
    }
  }

  const firstWhitespace = trimmed.search(/\s/);
  if (firstWhitespace < 0) return { url: trimmed, rest: "", wrapped: false };

  return {
    url: trimmed.slice(0, firstWhitespace),
    rest: trimmed.slice(firstWhitespace),
    wrapped: false,
  };
};

const formatMarkdownTarget = (url: string, rest: string, wrapped: boolean) =>
  wrapped ? `<${url}>${rest}` : `${url}${rest}`;

const rewriteMarkdownImagesSync = (
  markdown: string,
  transformUrl: (url: string) => string,
) => {
  const imagePattern = /(!\[[^\]]*]\()([^)\n]*)(\))/g;
  return markdown.replace(
    imagePattern,
    (_full, prefix: string, target: string, suffix: string) => {
      const parsed = parseMarkdownTarget(target);
      const nextUrl = transformUrl(parsed.url);
      const nextTarget = formatMarkdownTarget(
        nextUrl,
        parsed.rest,
        parsed.wrapped,
      );
      return `${prefix}${nextTarget}${suffix}`;
    },
  );
};

const rewriteMarkdownImagesAsync = async (
  markdown: string,
  transformUrl: (url: string) => Promise<string>,
) => {
  const imagePattern = /(!\[[^\]]*]\()([^)\n]*)(\))/g;
  const matches = Array.from(markdown.matchAll(imagePattern));
  if (!matches.length) return markdown;

  let rebuilt = "";
  let cursor = 0;

  for (const match of matches) {
    const full = match[0];
    const prefix = match[1] ?? "";
    const target = match[2] ?? "";
    const suffix = match[3] ?? "";
    const start = match.index ?? 0;
    const end = start + full.length;
    const parsed = parseMarkdownTarget(target);
    const nextUrl = await transformUrl(parsed.url);
    const nextTarget = formatMarkdownTarget(
      nextUrl,
      parsed.rest,
      parsed.wrapped,
    );

    rebuilt += markdown.slice(cursor, start);
    rebuilt += `${prefix}${nextTarget}${suffix}`;
    cursor = end;
  }

  rebuilt += markdown.slice(cursor);
  return rebuilt;
};

const EditComponent = forwardRef(
  (props: EditProps, ref: React.Ref<HTMLDivElement>) => {
    const { config } = useConfig();
    const { isPrivate } = useRepo();

    const { value, field, onChange, name, registerBeforeSubmitHook } = props;
    void ref;

    const options = field?.options ?? {};
    const format = options.format === "html" ? "html" : "markdown";
    const showSwitcher = options.switcher !== false;
    const canonicalValue = typeof value === "string" ? value : "";
    const [labelSlotEl, setLabelSlotEl] = useState<HTMLElement | null>(null);

    const [mode, setMode] = useState<"editor" | "source">("editor");
    const [sourceValue, setSourceValue] = useState(canonicalValue);
    const [editorValue, setEditorValue] = useState(canonicalValue);
    const [isTransforming, setIsTransforming] = useState(false);
    const editorDirtyRef = useRef(false);
    const editorValueRef = useRef(canonicalValue);
    const transformSeqRef = useRef(0);
    const mediaDialogRef = useRef<MediaDialogHandle>(null);
    const imageSubmitInFlightRef = useRef(false);
    const pendingImageSelectionRef = useRef<{
      resolve: (result: { kind: "url"; src: string } | null) => void;
      settled: boolean;
    } | null>(null);

    useEffect(() => {
      if (!props.labelSlotId || typeof document === "undefined") {
        setLabelSlotEl(null);
        return;
      }
      setLabelSlotEl(document.getElementById(props.labelSlotId));
    }, [props.labelSlotId]);

    const mediaConfig = useMemo<MediaSchema | undefined>(() => {
      if (!config?.object?.media?.length || options.media === false)
        return undefined;
      if (options.media && typeof options.media === "string") {
        return getSchemaByName(config.object, options.media, "media") as
          | MediaSchema
          | undefined;
      }
      return config.object.media[0] as MediaSchema | undefined;
    }, [config?.object, options.media]);

    const rootPath = useMemo(() => {
      if (!mediaConfig) return undefined;
      if (!options.path) return mediaConfig.input;

      const normalizedPath = normalizePath(options.path);
      const normalizedMediaRoot = normalizePath(mediaConfig.input);

      if (!normalizedPath.startsWith(normalizedMediaRoot)) {
        console.warn(
          `"${options.path}" is not within media root "${mediaConfig.input}". Defaulting to media root.`,
        );
        return mediaConfig.input;
      }

      return normalizedPath;
    }, [mediaConfig, options.path]);

    const allowedExtensions = useMemo(() => {
      if (!mediaConfig) return extensionCategories.image;

      let extensions = [...extensionCategories.image];

      if (Array.isArray(options.extensions) && options.extensions.length > 0) {
        extensions = options.extensions;
      } else if (
        Array.isArray(options.categories) &&
        options.categories.length > 0
      ) {
        extensions = options.categories.flatMap(
          (category) => extensionCategories[category] || [],
        );
      }

      if (
        Array.isArray(mediaConfig.extensions) &&
        mediaConfig.extensions.length > 0
      ) {
        extensions = extensions.filter((extension) =>
          mediaConfig.extensions?.includes(extension),
        );
      }

      return extensions;
    }, [mediaConfig, options.categories, options.extensions]);

    const toDisplayImageUrl = useCallback(
      async (url: string) => {
        if (!config || !mediaConfig) return url;
        if (!url || isExternalUrl(url) || isDataUrl(url)) return url;

        const inputPath = swapPrefix(
          url,
          mediaConfig.output,
          mediaConfig.input,
          true,
        );
        const normalizedInputPath = normalizePath(inputPath);
        const mediaInputRoot = normalizePath(mediaConfig.input);
        if (
          isAbsolutePath(url) &&
          !normalizedInputPath.startsWith(mediaInputRoot)
        ) {
          return url;
        }

        try {
          const rawUrl = await getRawUrl(
            config.owner,
            config.repo,
            config.branch,
            mediaConfig.name,
            inputPath,
            isPrivate,
            true,
          );
          return rawUrl || inputPath;
        } catch {
          return url;
        }
      },
      [config, isPrivate, mediaConfig],
    );

    const toCanonicalImageUrl = useCallback(
      (url: string) => {
        if (!config || !mediaConfig) return url;
        if (!url) return url;

        const relativePath = url.startsWith(
          "https://raw.githubusercontent.com/",
        )
          ? getRelativeUrl(config.owner, config.repo, config.branch, url, true)
          : url;

        return swapPrefix(relativePath, mediaConfig.input, mediaConfig.output);
      },
      [config, mediaConfig],
    );

    const sourceToEditor = useCallback(
      async (source: string) => {
        if (!mediaConfig || !config || !source) return source;

        if (format === "html") {
          const withInputPrefix = htmlSwapPrefix(
            source,
            mediaConfig.output,
            mediaConfig.input,
            true,
          );
          return relativeToRawUrls(
            config.owner,
            config.repo,
            config.branch,
            mediaConfig.name,
            withInputPrefix,
            isPrivate,
          );
        }

        const withInputPrefixInMd = rewriteMarkdownImagesSync(source, (url) =>
          swapPrefix(url, mediaConfig.output, mediaConfig.input, true),
        );
        const withInputPrefixEverywhere = htmlSwapPrefix(
          withInputPrefixInMd,
          mediaConfig.output,
          mediaConfig.input,
          true,
        );
        const htmlNormalized = await relativeToRawUrls(
          config.owner,
          config.repo,
          config.branch,
          mediaConfig.name,
          withInputPrefixEverywhere,
          isPrivate,
        );
        return rewriteMarkdownImagesAsync(htmlNormalized, toDisplayImageUrl);
      },
      [config, format, isPrivate, mediaConfig, toDisplayImageUrl],
    );

    const editorToSource = useCallback(
      async (editorContent: string) => {
        if (!mediaConfig || !config || !editorContent) return editorContent;

        if (format === "html") {
          const withRelativeUrls = rawToRelativeUrls(
            config.owner,
            config.repo,
            config.branch,
            editorContent,
          );
          return htmlSwapPrefix(
            withRelativeUrls,
            mediaConfig.input,
            mediaConfig.output,
          );
        }

        const withRelativeMd = rewriteMarkdownImagesSync(
          editorContent,
          toCanonicalImageUrl,
        );
        const withRelativeHtml = rawToRelativeUrls(
          config.owner,
          config.repo,
          config.branch,
          withRelativeMd,
        );
        const withOutputPrefixInMd = rewriteMarkdownImagesSync(
          withRelativeHtml,
          (url) => swapPrefix(url, mediaConfig.input, mediaConfig.output),
        );
        return htmlSwapPrefix(
          withOutputPrefixInMd,
          mediaConfig.input,
          mediaConfig.output,
        );
      },
      [config, format, mediaConfig, toCanonicalImageUrl],
    );

    useEffect(() => {
      editorValueRef.current = editorValue;
    }, [editorValue]);

    useEffect(() => {
      setSourceValue(canonicalValue);
    }, [canonicalValue]);

    useEffect(() => {
      if (mode !== "editor") return;
      const currentSeq = ++transformSeqRef.current;
      setIsTransforming(true);

      void sourceToEditor(canonicalValue)
        .then((displayValue) => {
          if (currentSeq !== transformSeqRef.current) return;
          setEditorValue(displayValue);
          editorDirtyRef.current = false;
        })
        .finally(() => {
          if (currentSeq === transformSeqRef.current) {
            setIsTransforming(false);
          }
        });
    }, [canonicalValue, mode, sourceToEditor]);

    const syncEditorToSource = useCallback(async () => {
      if (!editorDirtyRef.current) return;
      const canonical = await editorToSource(editorValueRef.current);
      setSourceValue(canonical);
      onChange(canonical);
      editorDirtyRef.current = false;
    }, [editorToSource, onChange]);

    useEffect(() => {
      if (!registerBeforeSubmitHook || !name) return;
      return registerBeforeSubmitHook(`rich-text:${name}`, async () => {
        if (mode !== "editor") return;
        await syncEditorToSource();
      });
    }, [mode, name, registerBeforeSubmitHook, syncEditorToSource]);

    const handleSwitchToEditor = useCallback(async () => {
      if (mode === "editor") return;
      setMode("editor");
      const currentSeq = ++transformSeqRef.current;
      setIsTransforming(true);
      try {
        const displayValue = await sourceToEditor(sourceValue);
        if (currentSeq === transformSeqRef.current) {
          setEditorValue(displayValue);
          editorDirtyRef.current = false;
        }
      } finally {
        if (currentSeq === transformSeqRef.current) {
          setIsTransforming(false);
        }
      }
    }, [mode, sourceToEditor, sourceValue]);

    const handleSwitchToSource = useCallback(async () => {
      if (mode === "source") return;
      const currentSeq = ++transformSeqRef.current;
      setIsTransforming(true);
      try {
        await syncEditorToSource();
        if (currentSeq === transformSeqRef.current) {
          setMode("source");
        }
      } finally {
        if (currentSeq === transformSeqRef.current) {
          setIsTransforming(false);
        }
      }
    }, [mode, syncEditorToSource]);

    const resolvePendingImageSelection = useCallback(
      (result: { kind: "url"; src: string } | null) => {
        const pending = pendingImageSelectionRef.current;
        if (!pending || pending.settled) return;
        pending.settled = true;
        pendingImageSelectionRef.current = null;
        pending.resolve(result);
      },
      [],
    );

    const handleRequestImage = useCallback(
      async (_context: unknown) => {
        if (!mediaConfig) return null;
        if (
          pendingImageSelectionRef.current &&
          !pendingImageSelectionRef.current.settled
        ) {
          resolvePendingImageSelection(null);
        }

        return new Promise<{ kind: "url"; src: string } | null>((resolve) => {
          pendingImageSelectionRef.current = { resolve, settled: false };
          mediaDialogRef.current?.open();
        });
      },
      [mediaConfig, resolvePendingImageSelection],
    );

    const handleMediaSubmit = useCallback(
      async (images: string[]) => {
        const selected = images[0];
        if (!selected) {
          resolvePendingImageSelection(null);
          return;
        }
        imageSubmitInFlightRef.current = true;
        try {
          const src = await toDisplayImageUrl(selected);
          resolvePendingImageSelection({ kind: "url", src });
        } finally {
          imageSubmitInFlightRef.current = false;
        }
      },
      [resolvePendingImageSelection, toDisplayImageUrl],
    );

    const handleSourceChange = useCallback(
      (nextValue: string) => {
        setSourceValue(nextValue);
        onChange(nextValue);
      },
      [onChange],
    );

    const handleUploadImage = useCallback(
      async (file: File) => {
        if (!config || !mediaConfig) return null;

        const extension = getFileExtension(file.name);
        if (
          allowedExtensions.length > 0 &&
          !allowedExtensions.includes(extension)
        ) {
          throw new Error(
            `Invalid file extension ".${extension}". Allowed: ${allowedExtensions
              .map((item) => `.${item}`)
              .join(", ")}`,
          );
        }

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () =>
            reject(new Error("Failed to read image file."));
          reader.readAsDataURL(file);
        });
        const content = dataUrl.replace(/^(.+,)/, "");
        const targetPath = joinPathSegments([
          rootPath ?? mediaConfig.input,
          file.name,
        ]);

        const response = await fetch(
          `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(targetPath)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "media",
              name: mediaConfig.name,
              content,
            }),
          },
        );
        if (!response.ok) {
          throw new Error(
            `Failed to upload file: ${response.status} ${response.statusText}`,
          );
        }

        const payload = (await response.json()) as ApiResponse<FileSaveData>;
        if (payload.status !== "success") {
          throw new Error(payload.message);
        }

        const uploadedPath = payload.data.path || targetPath;
        const src = await toDisplayImageUrl(uploadedPath);
        return {
          src,
          alt: file.name,
        };
      },
      [allowedExtensions, config, mediaConfig, rootPath, toDisplayImageUrl],
    );

    const triggerClass = cn(
      "relative inline-flex h-[calc(100%-1px)] items-center justify-center whitespace-nowrap border border-transparent px-2 text-[11px] text-foreground/60 transition-all",
      "hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      "dark:text-muted-foreground dark:hover:text-foreground",
    );

    const switcherNode = (
      <div className="inline-flex h-6 w-fit items-center justify-center rounded-md bg-muted p-0.5 text-muted-foreground">
        <button
          type="button"
          className={cn(
            triggerClass,
            "rounded-sm",
            mode === "editor" &&
              "bg-background text-foreground dark:border-input dark:bg-input/30 dark:text-foreground",
          )}
          onClick={() => void handleSwitchToEditor()}
          disabled={isTransforming}
          data-active={mode === "editor" ? "true" : undefined}
        >
          Editor
        </button>
        <button
          type="button"
          className={cn(
            triggerClass,
            "rounded-sm",
            mode === "source" &&
              "bg-background text-foreground dark:border-input dark:bg-input/30 dark:text-foreground",
          )}
          onClick={() => void handleSwitchToSource()}
          disabled={isTransforming}
          data-active={mode === "source" ? "true" : undefined}
        >
          Source
        </button>
      </div>
    );

    return (
      <div className="space-y-2">
        {showSwitcher && !labelSlotEl && (
          <div className="flex items-center justify-end">
            {switcherNode}
          </div>
        )}
        {showSwitcher &&
          labelSlotEl &&
          createPortal(
            <div className="flex items-center">{switcherNode}</div>,
            labelSlotEl,
          )}

        {mode === "editor" ? (
          <Editor
            value={editorValue}
            onChange={(nextValue) => {
              editorDirtyRef.current = true;
              setEditorValue(nextValue);
            }}
            format={format}
            className="cn-editor"
            enableImagePasteDrop={Boolean(mediaConfig)}
            onUploadImage={mediaConfig ? handleUploadImage : undefined}
            onRequestImage={mediaConfig ? handleRequestImage : undefined}
          />
        ) : (
          <Textarea
            value={sourceValue}
            onChange={(event) => handleSourceChange(event.target.value)}
            className="font-mono min-h-40"
            spellCheck={false}
          />
        )}

        {mediaConfig && (
          <MediaDialog
            ref={mediaDialogRef}
            media={mediaConfig.name}
            selected={[]}
            maxSelected={1}
            initialPath={rootPath}
            extensions={allowedExtensions}
            onSubmit={handleMediaSubmit}
            onOpenChange={(open) => {
              if (!open && !imageSubmitInFlightRef.current) {
                resolvePendingImageSelection(null);
              }
            }}
          />
        )}
      </div>
    );
  },
);

EditComponent.displayName = "EditComponent";

export { EditComponent };
