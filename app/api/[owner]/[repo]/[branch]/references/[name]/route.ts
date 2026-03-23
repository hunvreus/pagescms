export const maxDuration = 30;

import { type NextRequest } from "next/server";
import { parse } from "@/lib/serialization";
import { readFns } from "@/fields/registry";
import {
  getDateFromFilename,
  getFieldByPath,
  getPrimaryField,
  getSchemaByName,
  interpolate,
  safeAccess,
} from "@/lib/schema";
import { getConfig } from "@/lib/utils/config";
import { normalizePath } from "@/lib/utils/file";
import { getToken } from "@/lib/token";
import { checkRepoAccess, getCollectionCache } from "@/lib/github-cache";
import { getGithubId } from "@/lib/github-account";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

type ParsedReferenceItem = {
  name: string;
  path: string;
  primary?: unknown;
  fields: Record<string, any>;
};

const extractTemplateFields = (template: string) =>
  Array.from(template.matchAll(/\{([^}]+)\}/g))
    .map((match) => match[1])
    .filter((token) =>
      token === "primary" ||
      token.startsWith("fields.") ||
      token === "name" ||
      token === "path"
    );

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string; branch: string; name: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const githubId = await getGithubId(user.id);
    if (githubId) {
      const hasAccess = await checkRepoAccess(token, params.owner, params.repo, githubId);
      if (!hasAccess) throw createHttpError(`No access to repository ${params.owner}/${params.repo}.`, 403);
    }

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw createHttpError(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);

    const schema = getSchemaByName(config.object, params.name);
    if (!schema) throw createHttpError(`Schema not found for ${params.name}.`, 404);

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query") || "";
    const valueTemplate = searchParams.get("valueTemplate") || "{path}";
    const labelTemplate = searchParams.get("labelTemplate") || "{name}";
    const searchFields = searchParams.get("searchFields")?.split(",").filter(Boolean) || ["name"];
    const selectedValues = searchParams.getAll("value").filter(Boolean);
    const primaryField = getPrimaryField(schema);

    const requiredFields = Array.from(new Set([
      ...resolveReferenceFieldPaths(extractTemplateFields(valueTemplate), primaryField),
      ...resolveReferenceFieldPaths(extractTemplateFields(labelTemplate), primaryField),
      ...resolveReferenceFieldPaths(searchFields, primaryField),
    ]));

    const normalizedPath = normalizePath(schema.path || "");
    if (!normalizedPath) throw createHttpError(`Invalid path for collection "${params.name}".`, 400);

    let entries = await getCollectionCache(
      params.owner,
      params.repo,
      params.branch,
      normalizedPath,
      token,
      schema.view?.node?.filename,
    );

    if (schema.view?.node?.filename) {
      entries = entries.filter((item: any) => item.isNode || item.parentPath === schema.path || item.name !== schema.view.node.filename);
    }

    if (["all", "nodes", "others"].includes(schema.view?.node?.hideDirs)) {
      if (schema.view.node.hideDirs === "all") {
        entries = entries.filter((item: any) => item.type !== "dir");
      } else if (["nodes", "others"].includes(schema.view.node.hideDirs)) {
        entries = entries.filter((item: any) =>
          item.type !== "dir" ||
          (schema.view.node.hideDirs === "others"
            ? entries.some((subItem: any) => subItem.parentPath === item.path && subItem.isNode)
            : !entries.some((subItem: any) => subItem.parentPath === item.path && subItem.isNode)
          )
        );
      }
    }

    const parsedItems = parseReferenceItems(entries, schema, config, requiredFields, primaryField);
    const options = parsedItems
      .map((item) => ({
        value: String(interpolate(valueTemplate, item, "fields")),
        label: String(interpolate(labelTemplate, item, "fields")),
      }))
      .filter((item) => item.value.length > 0);

    const filtered = selectedValues.length > 0
      ? options.filter((item) => selectedValues.includes(item.value))
      : filterReferenceOptions(options, parsedItems, query, searchFields);

    return Response.json({
      status: "success",
      data: {
        options: filtered,
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}

const filterReferenceOptions = (
  options: { value: string; label: string }[],
  items: ParsedReferenceItem[],
  query: string,
  searchFields: string[],
) => {
  if (!query) return options;

  const normalizedQuery = query.toLowerCase();

  return options.filter((option, index) => {
    const item = items[index];
    if (!item) return false;

    return searchFields.some((field) => {
      if (field === "primary") {
        return item.primary && String(item.primary).toLowerCase().includes(normalizedQuery);
      }

      if (field === "name" || field === "path") {
        const value = item[field];
        return value && String(value).toLowerCase().includes(normalizedQuery);
      }

      const fieldPath = field.startsWith("fields.") ? field.replace(/^fields\./, "") : field;
      const value = safeAccess(item.fields, fieldPath);
      return value && String(value).toLowerCase().includes(normalizedQuery);
    });
  });
};

const parseReferenceItems = (
  contents: any[],
  schema: Record<string, any>,
  config: Record<string, any>,
  selectedFields: string[],
  primaryField?: string,
): ParsedReferenceItem[] => {
  const serializedTypes = ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml"];
  const excludedFiles = schema.exclude || [];

  return contents.reduce<ParsedReferenceItem[]>((acc, item: any) => {
      if (
        item.type !== "file" ||
        (!(item.path.endsWith(`.${schema.extension}`)) && schema.extension !== "") ||
        excludedFiles.includes(item.name)
      ) {
        return acc;
      }

      let contentObject: Record<string, any> = {};

      if (serializedTypes.includes(schema.format) && schema.fields) {
        try {
          const parsedObject = parse(item.content, { format: schema.format, delimiters: schema.delimiters });
          contentObject = pickAndTransformFields(parsedObject, schema.fields, selectedFields, config);
        } catch (error: any) {
          console.error(`Error parsing frontmatter for file "${item.path}": ${error.message}`);
        }
      }

      if (!schema.fields || schema.fields.length === 0) {
        contentObject.name = item.name;
      }

      if (!contentObject.date && schema.filename?.startsWith("{year}-{month}-{day}")) {
        const filenameDate = getDateFromFilename(item.name);
        if (filenameDate) contentObject.date = filenameDate.string;
      }

      acc.push({
        name: item.name,
        path: item.path,
        primary: primaryField ? safeAccess(contentObject, primaryField) : undefined,
        fields: contentObject,
      });

      return acc;
    }, []);
};

const resolveReferenceFieldPaths = (
  tokens: string[],
  primaryField?: string,
) =>
  tokens.flatMap((token) => {
    if (token === "primary") {
      return primaryField ? [primaryField] : [];
    }
    return [token];
  });

const pickAndTransformFields = (
  parsedObject: Record<string, any>,
  schemaFields: any[],
  fieldPaths: string[],
  config: Record<string, any>,
) => {
  const output: Record<string, any> = {};
  const dedupedPaths = Array.from(new Set(fieldPaths));

  dedupedPaths.forEach((fieldPath) => {
    if (fieldPath === "name" || fieldPath === "path") return;

    const normalizedFieldPath = fieldPath.startsWith("fields.") ? fieldPath.replace(/^fields\./, "") : fieldPath;
    const field = getFieldByPath(schemaFields, normalizedFieldPath);
    if (!field) return;

    let value = safeAccess(parsedObject, normalizedFieldPath);
    if (typeof field.type === "string" && readFns[field.type]) {
      const transformedValue = readFns[field.type](value, field, config);
      if (transformedValue !== undefined) value = transformedValue;
    }

    setByPath(output, normalizedFieldPath, value);
  });

  return output;
};

const setByPath = (target: Record<string, any>, path: string, value: any) => {
  if (!path) return;

  const segments = path.split(".");
  let cursor = target;

  segments.forEach((segment, index) => {
    const isLeaf = index === segments.length - 1;
    if (isLeaf) {
      cursor[segment] = value;
      return;
    }

    if (!cursor[segment] || typeof cursor[segment] !== "object") {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });
};
