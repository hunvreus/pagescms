"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormContext } from "react-hook-form";
import { createPortal } from "react-dom";
import { Editor, type ImagePickerContext } from "@/components/ui/editor";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/lib/github-image";
import {
  decodePathSafely,
  extensionCategories,
  generateRandomUploadName,
  getFileExtension,
  joinPathSegments,
  normalizeMediaPath,
  normalizePath,
} from "@/lib/utils/file";
import type { ApiResponse, FileSaveData } from "@/types/api";
import type { Field } from "@/types/field";
import "./edit-component.css";

type MediaSchema = {
  name: string;
  input: string;
  output: string;
  extensions?: string[];
  rename?: boolean;
};

type FieldOptions = {
  format?: "html" | "markdown";
  switcher?: boolean;
  media?: false | string;
  path?: string;
  extensions?: string[];
  categories?: string[];
  rename?: boolean;
};

type EditProps = {
  name?: string;
  value?: string;
  field?: Field & {
    options?: FieldOptions;
  };
  labelSlotId?: string;
  registerBeforeSubmitHook?: (
    key: string,
    hook: () => void | Promise<void>,
  ) => () => void;
  onChangeRegistered?: () => void;
  onChange: (value: string) => void;
};

const isExternalUrl = (value: string) =>
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.startsWith("//");

const isDataUrl = (value: string) => value.startsWith("data:");
const isAbsolutePath = (value: string) => value.startsWith("/");

const isValidMarkdownTitle = (value: string) => {
  if (!value) return false;

  const first = value[0];
  const last = value[value.length - 1];
  if (first === '"' && last === '"') return true;
  if (first === "'" && last === "'") return true;
  if (first !== "(" || last !== ")") return false;

  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (char === "\\") {
      i += 1;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (depth === 0 && i < value.length - 1) return false;
    if (depth < 0) return false;
  }

  return depth === 0;
};

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

  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    if (!/\s/.test(trimmed[i])) continue;

    const restCandidate = trimmed.slice(i);
    const restTrimmed = restCandidate.trimStart();
    if (!isValidMarkdownTitle(restTrimmed)) continue;

    return {
      url: trimmed.slice(0, i),
      rest: restCandidate,
      wrapped: false,
    };
  }

  return { url: trimmed, rest: "", wrapped: false };
};

const formatMarkdownTarget = (url: string, rest: string, wrapped: boolean) => {
  const mustWrap = wrapped || (/\s/.test(url) && rest.trim().length === 0);
  return mustWrap ? `<${url}>${rest}` : `${url}${rest}`;
};

type MarkdownImageTargetMatch = {
  targetStart: number;
  targetEnd: number;
  target: string;
};

const findMatchingMarkdownBracket = (
  input: string,
  start: number,
  open: string,
  close: string,
) => {
  let depth = 1;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];

    if (char === "\\") {
      i += 1;
      continue;
    }

    if (char === open) {
      depth += 1;
      continue;
    }

    if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
};

const findMatchingMarkdownParen = (input: string, start: number) => {
  let depth = 1;
  let quote: '"' | "'" | null = null;
  let angleDepth = 0;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];

    if (char === "\\") {
      i += 1;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "<") {
      angleDepth += 1;
      continue;
    }

    if (char === ">" && angleDepth > 0) {
      angleDepth -= 1;
      continue;
    }

    if (angleDepth > 0) continue;

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
};

const findMarkdownImageTargets = (markdown: string): MarkdownImageTargetMatch[] => {
  const matches: MarkdownImageTargetMatch[] = [];

  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] !== "!" || markdown[i + 1] !== "[") continue;

    const altEnd = findMatchingMarkdownBracket(markdown, i + 2, "[", "]");
    if (altEnd < 0 || markdown[altEnd + 1] !== "(") continue;

    const targetStart = altEnd + 2;
    const targetEnd = findMatchingMarkdownParen(markdown, targetStart);
    if (targetEnd < 0) continue;

    matches.push({
      targetStart,
      targetEnd,
      target: markdown.slice(targetStart, targetEnd),
    });

    i = targetEnd;
  }

  return matches;
};

const rewriteMarkdownImagesSync = (
  markdown: string,
  transformUrl: (url: string) => string,
) => {
  const matches = findMarkdownImageTargets(markdown);
  if (!matches.length) return markdown;

  let rebuilt = "";
  let cursor = 0;

  for (const match of matches) {
    const parsed = parseMarkdownTarget(match.target);
    const nextUrl = transformUrl(parsed.url);
    const nextTarget = formatMarkdownTarget(
      nextUrl,
      parsed.rest,
      parsed.wrapped,
    );

    rebuilt += markdown.slice(cursor, match.targetStart);
    rebuilt += nextTarget;
    cursor = match.targetEnd;
  }

  rebuilt += markdown.slice(cursor);
  return rebuilt;
};

const rewriteMarkdownImagesAsync = async (
  markdown: string,
  transformUrl: (url: string) => Promise<string>,
) => {
  const matches = findMarkdownImageTargets(markdown);
  if (!matches.length) return markdown;

  let rebuilt = "";
  let cursor = 0;

  for (const match of matches) {
    const parsed = parseMarkdownTarget(match.target);
    const nextUrl = await transformUrl(parsed.url);
    const nextTarget = formatMarkdownTarget(
      nextUrl,
      parsed.rest,
      parsed.wrapped,
    );

    rebuilt += markdown.slice(cursor, match.targetStart);
    rebuilt += nextTarget;
    cursor = match.targetEnd;
  }

  rebuilt += markdown.slice(cursor);
  return rebuilt;
};

const EditComponent = forwardRef(
  (props: EditProps, ref: React.Ref<HTMLDivElement>) => {
    const { config } = useConfig();
    const { isPrivate } = useRepo();

    const {
      value,
      field,
      onChange,
      name,
      registerBeforeSubmitHook,
      onChangeRegistered,
    } = props;
    void ref;
    const form = useFormContext();

    const options = field?.options ?? {};
    const isReadonly = Boolean(field?.readonly);
    const format = options.format === "html" ? "html" : "markdown";
    const showSwitcher = options.switcher !== false;
    const canonicalValue = typeof value === "string" ? value : "";
    const [labelSlotEl, setLabelSlotEl] = useState<HTMLElement | null>(null);

    const [mode, setMode] = useState<"editor" | "source">("editor");
    const [sourceValue, setSourceValue] = useState(canonicalValue);
    const [editorValue, setEditorValue] = useState(canonicalValue);
    const [isTransforming, setIsTransforming] = useState(false);
    const [hasHydratedEditor, setHasHydratedEditor] = useState(false);
    const [pendingUploads, setPendingUploads] = useState(0);
    const editorDirtyRef = useRef(false);
    const editorValueRef = useRef(canonicalValue);
    const syncedEditorValueRef = useRef(canonicalValue);
    const onChangeRef = useRef(onChange);
    const modeRef = useRef(mode);
    const skipNextSourceToEditorForCanonicalRef = useRef<string | null>(null);
    const transformSeqRef = useRef(0);
    const mediaDialogRef = useRef<MediaDialogHandle>(null);
    const imageSubmitInFlightRef = useRef(false);
    const pendingImageSelectionRef = useRef<{
      context?: ImagePickerContext;
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

      const mediaExtensions = mediaConfig.extensions;
      if (Array.isArray(mediaExtensions) && mediaExtensions.length > 0) {
        extensions = extensions.filter((extension) =>
          mediaExtensions.includes(extension),
        );
      }

      return extensions;
    }, [mediaConfig, options.categories, options.extensions]);

    const toDisplayImageUrl = useCallback(
      async (url: string) => {
        if (!config || !mediaConfig) return url;
        if (!url || isExternalUrl(url) || isDataUrl(url)) return url;
        const decodedUrl = normalizeMediaPath(decodePathSafely(url));
        const canonicalOutputPath = swapPrefix(
          decodedUrl,
          mediaConfig.input,
          mediaConfig.output,
        );

        const inputPath = swapPrefix(
          decodedUrl,
          mediaConfig.output,
          mediaConfig.input,
          true,
        );
        const normalizedInputPath = normalizePath(inputPath);
        const mediaInputRoot = normalizePath(mediaConfig.input);
        if (
          isAbsolutePath(decodedUrl) &&
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
            normalizedInputPath,
            isPrivate,
            true,
          );
          // Keep output-space path canonical when raw URL resolution misses.
          return rawUrl || canonicalOutputPath;
        } catch {
          return canonicalOutputPath;
        }
      },
      [config, isPrivate, mediaConfig],
    );

    const toCanonicalImageUrl = useCallback(
      (url: string) => {
        if (!config || !mediaConfig) return url;
        if (!url) return url;
        if (isExternalUrl(url) && !url.startsWith("https://raw.githubusercontent.com/")) {
          return url;
        }

        const relativePath = getRelativeUrl(
          config.owner,
          config.repo,
          config.branch,
          url,
          false,
        );
        const normalizedRelativePath = normalizeMediaPath(
          decodePathSafely(relativePath),
        );

        return swapPrefix(
          normalizedRelativePath,
          mediaConfig.input,
          mediaConfig.output,
        );
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
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
      setSourceValue(canonicalValue);
    }, [canonicalValue]);

    useEffect(() => {
      if (mode !== "editor") return;
      if (skipNextSourceToEditorForCanonicalRef.current === canonicalValue) {
        skipNextSourceToEditorForCanonicalRef.current = null;
        return;
      }
      const currentSeq = ++transformSeqRef.current;
      setIsTransforming(true);

      void sourceToEditor(canonicalValue)
        .then((displayValue) => {
          if (currentSeq !== transformSeqRef.current) return;
          setEditorValue(displayValue);
          syncedEditorValueRef.current = displayValue;
          editorDirtyRef.current = false;
          setHasHydratedEditor(true);
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
      skipNextSourceToEditorForCanonicalRef.current = canonical;
      if (name) {
        form.setValue(name, canonical, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      } else {
        onChangeRef.current(canonical);
      }
      editorDirtyRef.current = false;
    }, [editorToSource, form, name]);

    useEffect(() => {
      if (!registerBeforeSubmitHook || !name) {
        return;
      }
      const key = `rich-text:${name}`;
      return registerBeforeSubmitHook(key, async () => {
        if (modeRef.current !== "editor") return;
        await syncEditorToSource();
      });
    }, [name, registerBeforeSubmitHook, syncEditorToSource]);

    const handleSwitchToEditor = useCallback(async () => {
      if (pendingUploads > 0) return;
      if (mode === "editor") return;
      setMode("editor");
      const currentSeq = ++transformSeqRef.current;
      setIsTransforming(true);
      try {
        const displayValue = await sourceToEditor(sourceValue);
        if (currentSeq === transformSeqRef.current) {
          setEditorValue(displayValue);
          syncedEditorValueRef.current = displayValue;
          editorDirtyRef.current = false;
        }
      } finally {
        if (currentSeq === transformSeqRef.current) {
          setIsTransforming(false);
        }
      }
    }, [mode, pendingUploads, sourceToEditor, sourceValue]);

    const handleSwitchToSource = useCallback(async () => {
      if (pendingUploads > 0) return;
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
    }, [mode, pendingUploads, syncEditorToSource]);

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
      async (context: ImagePickerContext) => {
        if (!mediaConfig) return null;
        if (
          pendingImageSelectionRef.current &&
          !pendingImageSelectionRef.current.settled
        ) {
          resolvePendingImageSelection(null);
        }

        return new Promise<{ kind: "url"; src: string } | null>((resolve) => {
          context.editor.commands.blur();
          pendingImageSelectionRef.current = {
            context,
            resolve,
            settled: false,
          };
          requestAnimationFrame(() => {
            mediaDialogRef.current?.open();
          });
        });
      },
      [mediaConfig, resolvePendingImageSelection],
    );

    const handleMediaSubmit = useCallback(
      async (images: string[]) => {
        if (!images.length) {
          resolvePendingImageSelection(null);
          return;
        }
        imageSubmitInFlightRef.current = true;
        try {
          const pending = pendingImageSelectionRef.current;
          const sources = await Promise.all(
            images.map((image) => toDisplayImageUrl(image)),
          );

          if (images.length === 1 || !pending?.context) {
            resolvePendingImageSelection({ kind: "url", src: sources[0] });
            return;
          }

          const content = sources.map((src) => ({
            type: "image",
            attrs: { src },
          }));

          pending.context.editor.chain().focus().insertContent(content).run();
          resolvePendingImageSelection(null);
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
        onChangeRegistered?.();
      },
      [onChange, onChangeRegistered],
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
        const uploadFilename =
          (options.rename ?? mediaConfig.rename)
            ? generateRandomUploadName(extension)
            : file.name;
        const targetPath = joinPathSegments([
          rootPath ?? mediaConfig.input,
          uploadFilename,
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
      [
        allowedExtensions,
        config,
        mediaConfig,
        options.rename,
        rootPath,
        toDisplayImageUrl,
      ],
    );

    const triggerClass = cn(
      "relative inline-flex h-[calc(100%-1px)] items-center justify-center whitespace-nowrap border border-transparent px-2 text-xs text-foreground/60 transition-all",
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
          disabled={isReadonly || isTransforming || pendingUploads > 0}
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
          disabled={isReadonly || isTransforming || pendingUploads > 0}
          data-active={mode === "source" ? "true" : undefined}
        >
          Source
        </button>
      </div>
    );

    return (
      <div className="space-y-2">
        {showSwitcher && !labelSlotEl && (
          <div className="flex items-center justify-end">{switcherNode}</div>
        )}
        {showSwitcher &&
          labelSlotEl &&
          createPortal(
            <div className="flex items-center">{switcherNode}</div>,
            labelSlotEl,
          )}

        {mode === "editor" ? (
          !hasHydratedEditor && isTransforming ? (
            <Skeleton className="h-40 w-full rounded-md" />
          ) : (
            <Editor
              value={editorValue}
              onChange={(nextValue) => {
                if (nextValue === syncedEditorValueRef.current) return;
                if (!editorDirtyRef.current && name) {
                  // Mark field dirty immediately without running full source/editor transforms on every keystroke.
                  const currentValue = form.getValues(name);
                  form.setValue(name, currentValue, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: false,
                  });
                }
                editorDirtyRef.current = true;
                syncedEditorValueRef.current = nextValue;
                setEditorValue(nextValue);
                onChangeRegistered?.();
              }}
              format={format}
              className="cn-editor"
              enableImages={Boolean(mediaConfig)}
              enableImagePasteDrop={Boolean(mediaConfig)}
              onUploadImage={mediaConfig ? handleUploadImage : undefined}
              onRequestImage={mediaConfig ? handleRequestImage : undefined}
              onPendingUploadsChange={setPendingUploads}
              disabled={isReadonly}
            />
          )
        ) : (
          <Textarea
            value={sourceValue}
            onChange={(event) => handleSourceChange(event.target.value)}
            className="font-mono min-h-40"
            spellCheck={false}
            readOnly={isReadonly}
          />
        )}

        {mediaConfig && (
          <MediaDialog
            ref={mediaDialogRef}
            media={mediaConfig.name}
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
