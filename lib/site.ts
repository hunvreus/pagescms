import { format as formatDate } from "date-fns";
import { marked } from "marked";
import type {
  Field,
  PreviewBind,
  PreviewRule,
  PreviewTextTransform,
} from "@/types/field";
import { resolveSchemaTemplate, safeAccess } from "@/lib/schema";
import { getFileExtension, getFileName, normalizePath } from "@/lib/utils/file";

type PreviewBindingPayload = {
  target: string;
  bind: PreviewBind;
  value: string | boolean | Array<string | boolean>;
};

const normalizeSiteUrl = (url: string) => url.replace(/\/+$/, "");

const normalizeSitePath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

const getSiteSettings = (configObject?: Record<string, any>) => {
  if (!configObject || typeof configObject !== "object") return {};
  const settings = configObject.settings;
  if (!settings || typeof settings !== "object") return {};
  const site = settings.site;
  return site && typeof site === "object" ? site : {};
};

const getPreviewDefaultOpen = (configObject?: Record<string, any>) => {
  const site = getSiteSettings(configObject);
  return Boolean(site?.preview?.defaultOpen);
};

const resolveSchemaSitePath = (
  schema?: Record<string, any> | null,
  values?: Record<string, any>,
  entryPath?: string | null,
) => {
  if (!schema?.site?.path || typeof schema.site.path !== "string") return null;

  const normalizedValues = values || {};
  const filename = entryPath ? getFileName(normalizePath(entryPath)) : "";
  const extension = filename ? getFileExtension(filename) : "";
  const basename = (
    filename && extension
      ? filename.slice(0, -(extension.length + 1))
      : filename
  );
  const aliases: Record<string, unknown> = {};

  const slug = safeAccess(normalizedValues, "slug");
  if (slug != null && slug !== "") aliases.slug = slug;
  else if (basename) aliases.slug = basename;

  if (filename) aliases.filename = filename;
  if (basename) aliases.basename = basename;

  return normalizeSitePath(
    resolveSchemaTemplate(schema.site.path, schema, normalizedValues, {
      aliases,
      slugifyValues: true,
    }),
  );
};

const buildSiteUrl = (
  configObject?: Record<string, any>,
  schema?: Record<string, any> | null,
  values?: Record<string, any>,
  entryPath?: string | null,
) => {
  const site = getSiteSettings(configObject);
  if (!site?.url || typeof site.url !== "string") return null;

  const resolvedPath = resolveSchemaSitePath(schema, values, entryPath);
  if (!resolvedPath) return null;

  try {
    return new URL(resolvedPath, `${normalizeSiteUrl(site.url)}/`).toString();
  } catch {
    return null;
  }
};

const normalizePreviewRules = (preview: Field["preview"]): PreviewRule[] => {
  if (!preview) return [];
  return Array.isArray(preview) ? preview : [preview];
};

const isEmptyPreviewValue = (value: unknown) => {
  if (value == null) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const formatTextTransform = (
  value: string,
  mode: PreviewTextTransform,
) => {
  switch (mode) {
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "capitalize":
      return value.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
    default:
      return value;
  }
};

const stringifyPreviewValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
};

const applyPreviewTransforms = (
  input: unknown,
  transforms: PreviewRule["transform"],
) => {
  if (!transforms?.length) return input;

  return transforms.reduce<unknown>((currentValue, transform) => {
    if ("fallback" in transform) {
      return isEmptyPreviewValue(currentValue)
        ? transform.fallback
        : currentValue;
    }

    if ("join" in transform) {
      if (!Array.isArray(currentValue)) return currentValue;
      return currentValue
        .map((item) => stringifyPreviewValue(item))
        .filter((item) => item !== "")
        .join(transform.join);
    }

    if ("date" in transform) {
      const applyDateTransform = (value: unknown) => {
        if (isEmptyPreviewValue(value)) return value;
        const date = value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(date.getTime())) return value;
        try {
          return formatDate(date, transform.date);
        } catch {
          return value;
        }
      };

      return Array.isArray(currentValue)
        ? currentValue.map(applyDateTransform)
        : applyDateTransform(currentValue);
    }

    if ("text" in transform) {
      const applyTextTransform = (value: unknown) =>
        formatTextTransform(stringifyPreviewValue(value), transform.text);

      return Array.isArray(currentValue)
        ? currentValue.map(applyTextTransform)
        : applyTextTransform(currentValue);
    }

    if ("prefix" in transform) {
      const applyPrefixTransform = (value: unknown) => {
        if (isEmptyPreviewValue(value)) return value;
        return `${transform.prefix}${stringifyPreviewValue(value)}`;
      };

      return Array.isArray(currentValue)
        ? currentValue.map(applyPrefixTransform)
        : applyPrefixTransform(currentValue);
    }

    if ("suffix" in transform) {
      const applySuffixTransform = (value: unknown) => {
        if (isEmptyPreviewValue(value)) return value;
        return `${stringifyPreviewValue(value)}${transform.suffix}`;
      };

      return Array.isArray(currentValue)
        ? currentValue.map(applySuffixTransform)
        : applySuffixTransform(currentValue);
    }

    return currentValue;
  }, input);
};

const renderHtmlPreviewValue = (field: Field, value: string) => {
  if (field.type === "rich-text") return value;

  const fieldOptions = field.options && typeof field.options === "object"
    ? field.options
    : null;
  const format = typeof fieldOptions?.format === "string"
    ? fieldOptions.format
    : null;
  const isMarkdownField = (
    field.type === "text"
    || (field.type === "code" && (format == null || format === "markdown" || format === "md"))
  );

  if (!isMarkdownField) return value;

  const rendered = marked.parse(value);
  return typeof rendered === "string" ? rendered : value;
};

const coerceBindingValue = (
  field: Field,
  bind: PreviewBind,
  value: unknown,
): string | boolean | Array<string | boolean> => {
  if (bind === "checked") {
    if (Array.isArray(value)) {
      return value.map((item) => Boolean(item));
    }
    return Boolean(value);
  }

  const coerceStringValue = (item: unknown) => {
    const stringValue = stringifyPreviewValue(item);
    if (bind === "html") return renderHtmlPreviewValue(field, stringValue);
    return stringValue;
  };

  if (Array.isArray(value)) {
    return value.map((item) => coerceStringValue(item));
  }

  return coerceStringValue(value);
};

const buildPreviewBinding = (
  field: Field,
  rule: PreviewRule,
  value: unknown,
): PreviewBindingPayload => ({
  target: rule.target,
  bind: rule.bind,
  value: coerceBindingValue(
    field,
    rule.bind,
    applyPreviewTransforms(value, rule.transform),
  ),
});

const collectPreviewBindings = (
  fields: Field[],
  values: Record<string, any>,
) => {
  const bindings: PreviewBindingPayload[] = [];

  const visitFields = (currentFields: Field[], parentPath?: string) => {
    currentFields.forEach((field) => {
      const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;
      const value = safeAccess(values, fieldPath);

      normalizePreviewRules(field.preview).forEach((rule) => {
        bindings.push(buildPreviewBinding(field, rule, value));
      });

      if (field.list) return;

      if (field.type === "object" && field.fields?.length) {
        visitFields(field.fields, fieldPath);
        return;
      }

      if (field.type === "block" && field.blocks?.length && value && typeof value === "object") {
        const blockKey = field.blockKey || "_block";
        const selectedBlock = field.blocks.find(
          (block) => block.name === value?.[blockKey],
        );
        if (selectedBlock?.fields?.length) {
          visitFields(selectedBlock.fields, fieldPath);
        }
      }
    });
  };

  visitFields(fields);
  return bindings;
};

export type { PreviewBindingPayload };
export {
  buildSiteUrl,
  collectPreviewBindings,
  getPreviewDefaultOpen,
  getSiteSettings,
  normalizeSitePath,
  normalizeSiteUrl,
  resolveSchemaSitePath,
};
