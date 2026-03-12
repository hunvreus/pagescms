export const maxDuration = 30;

import { type NextRequest } from "next/server";
import { headers } from "next/headers";
import { readFns } from "@/fields/registry";
import { parse } from "@/lib/serialization";
import { deepMap, getDateFromFilename, getFieldByPath, getSchemaByName, safeAccess } from "@/lib/schema";
import { getConfig } from "@/lib/utils/config";
import { normalizePath } from "@/lib/utils/file";
import { auth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { getCollectionCache, checkRepoAccess } from "@/lib/github-cache";
import { getGithubId } from "@/lib/github-account";
import { toErrorResponse } from "@/lib/api-error";

/**
 * Fetches and parses collection contents from GitHub repositories
 * (for collection views and searches)
 * 
 * GET /api/[owner]/[repo]/[branch]/collections/[name]
 * 
 * Requires authentication. If type is set to "search", we filter the contents
 * based on the query and fields parameters.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, name: string }> }
) {
  try {
    const params = await context.params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) return new Response(null, { status: 401 });
    const user = session.user;

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    const githubId = await getGithubId(user.id);
    if (githubId) {
      const hasAccess = await checkRepoAccess(token, params.owner, params.repo, githubId);
      if (!hasAccess) throw new Error(`No access to repository ${params.owner}/${params.repo}.`);
    }

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const schema = getSchemaByName(config.object, params.name);
    if (!schema) throw new Error(`Schema not found for ${params.name}.`);

    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get("path") || "";
    const query = (searchParams.get("query") || "").trim();
    const sortBy = searchParams.get("sortBy") || "name";
    const sortDir = searchParams.get("sortDir") === "desc" ? "desc" : "asc";
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("pageSize") || "25", 10) || 25));
    const applyServerPagination = searchParams.has("page")
      || searchParams.has("pageSize")
      || searchParams.has("sortBy")
      || searchParams.has("sortDir");
    const requestedFields = searchParams.get("fields")
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const searchableFields = requestedFields || ["name", "path"];

    const normalizedPath = normalizePath(path);
    if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${path}" for collection "${params.name}".`);

    if (schema.subfolders === false) {
      if (normalizedPath !== schema.path) throw new Error(`Invalid path "${path}" for collection "${params.name}".`);
    }

    let entries = await getCollectionCache(params.owner, params.repo, params.branch, normalizedPath, token, schema.view?.node?.filename);
    
    let data: {
      contents: Record<string, any>[],
      errors: string[]
    } = {
      contents: [],
      errors: []
    };

    if (schema.view?.node?.filename) {
      // Remove node entries from subfolders
      entries = entries.filter((item: any) => item.isNode || item.parentPath === schema.path || item.name !== schema.view.node.filename);
    }

    if (['all', 'nodes', 'others'].includes(schema.view?.node?.hideDirs)) {
      if (schema.view.node.hideDirs === "all") {
        // Remove all dirs
        entries = entries.filter((item: any) => item.type !== "dir");
      } else if (["nodes", "others"].includes(schema.view.node.hideDirs)) {
        // Remove node dirs or non node dirs
        entries = entries.filter((item: any) =>
          item.type !== "dir" ||
          (schema.view.node.hideDirs === "others"
            ? entries.some((subItem: any) => subItem.parentPath === item.path && subItem.isNode)
            : !entries.some((subItem: any) => subItem.parentPath === item.path && subItem.isNode)
          )
        );
      }
    }
    
    if (entries) {
      data = parseContents(entries, schema, config, requestedFields);

      if (query) {
        const searchQuery = query.toLowerCase();
        data.contents = data.contents.filter((item) =>
          searchableFields.some((field) => {
            if (field === "name" || field === "path") {
              const value = item[field];
              return value && String(value).toLowerCase().includes(searchQuery);
            }

            const fieldPath = field.startsWith("fields.") ? field.replace(/^fields\./, "") : field;
            const value = safeAccess(item.fields, fieldPath);
            return value && String(value).toLowerCase().includes(searchQuery);
          }),
        );
      }

      if (applyServerPagination) {
        data.contents = sortCollectionRows(data.contents, sortBy, sortDir, Boolean(schema.view?.foldersFirst));

        const total = data.contents.length;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pagedContents = data.contents.slice(start, end);
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const currentPage = Math.min(page, pageCount);

        return Response.json({
          status: "success",
          data: {
            ...data,
            contents: pagedContents,
            meta: {
              total,
              page: currentPage,
              pageSize,
              pageCount,
              sortBy,
              sortDir,
            },
          }
        });
      }
    }
    return Response.json({
      status: "success",
      data: {
        ...data,
        meta: {
          total: 0,
          page,
          pageSize,
          pageCount: 1,
          sortBy,
          sortDir,
        },
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}

// Parse the list of entries into objects based on the content schema.
const parseContents = (
  contents: any,
  schema: Record<string, any>,
  config: Record<string, any>,
  selectedFields?: string[],
): {
  contents: Record<string, any>[],
  errors: string[]
} => {
  const serializedTypes = ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml"];
  const excludedFiles = schema.exclude || [];

  let parsedContents: Record<string, any>[] = [];
  let parsedErrors: string[] = [];

  parsedContents = contents.map((item: any) => {
    // If it's a file and it matches the schema extension
    if (item.type === "file" && (item.path.endsWith(`.${schema.extension}`) || schema.extension === "") && !excludedFiles.includes(item.name)) {
      let contentObject: Record<string, any> = {};
      
      if (serializedTypes.includes(schema.format) && schema.fields) {
        // If we are dealing with a serialized format and we have fields defined
        try {
          const parsedObject = parse(item.content, { format: schema.format, delimiters: schema.delimiters });
          if (Array.isArray(selectedFields) && selectedFields.length > 0) {
            const requestedFieldPaths = selectedFields
              .filter((fieldPath) => fieldPath !== "name" && fieldPath !== "path")
              .map((fieldPath) => fieldPath.startsWith("fields.") ? fieldPath.replace(/^fields\./, "") : fieldPath);
            contentObject = pickAndTransformFields(parsedObject, schema.fields, requestedFieldPaths, config);
          } else {
            // TODO: review if this works for blocks
            contentObject = deepMap(parsedObject, schema.fields, (value, field) => {
              if (typeof field.type === 'string' && readFns[field.type]) {
                return readFns[field.type](value, field, config);
              }
              return value;
            });
          }
        } catch (error: any) {
          // TODO: send this to the client?
          console.error(`Error parsing frontmatter for file "${item.path}": ${error.message}`);
          parsedErrors.push(`Error parsing frontmatter for file "${item.path}": ${error.message}`);
        }
      }

      if (!schema.fields || schema.fields.length === 0) {
        // If we don't have fields defined, we just add the name for display
        contentObject.name = item.name;
      }
      
      // TODO: make this configurable
      // TODO: support other date formats
      if (!contentObject.date && schema.filename.startsWith("{year}-{month}-{day}")) {
        // If we couldn"t get a date from the content and filenames have a date, we extract it
        const filenameDate = getDateFromFilename(item.name);
        if (filenameDate) {
          contentObject.date = filenameDate.string;
        }
      }
      
      // TODO: handle proper returns
      return {
        sha: item.sha,
        name: item.name,
        parentPath: item.parentPath,
        path: item.path,
        fields: contentObject,
        type: "file",
        isNode: item.isNode,
      };
    } else if (item.type === "dir" && !excludedFiles.includes(item.name) && schema.subfolders !== false) {
      return {
        name: item.name,
        parentPath: item.parentPath,
        path: item.path,
        type: "dir",
      };
    }
  }).filter((item: any) => item !== undefined);

  return {
    contents: parsedContents,
    errors: parsedErrors
  }
}

const pickAndTransformFields = (
  parsedObject: Record<string, any>,
  schemaFields: any[],
  fieldPaths: string[],
  config: Record<string, any>,
) => {
  const output: Record<string, any> = {};
  const dedupedPaths = Array.from(new Set(fieldPaths));

  dedupedPaths.forEach((fieldPath) => {
    const field = getFieldByPath(schemaFields, fieldPath);
    if (!field) return;

    let value = safeAccess(parsedObject, fieldPath);
    if (typeof field.type === "string" && readFns[field.type]) {
      const transformedValue = readFns[field.type](value, field, config);
      if (transformedValue !== undefined) value = transformedValue;
    }
    setByPath(output, fieldPath, value);
  });

  return output;
};

const setByPath = (target: Record<string, any>, path: string, value: any) => {
  if (!path) return;
  const segments = path.split(".");
  let cursor: Record<string, any> = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (cursor[key] == null || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[segments[segments.length - 1]] = value;
};

const sortCollectionRows = (
  rows: Record<string, any>[],
  sortBy: string,
  sortDir: "asc" | "desc",
  foldersFirst: boolean,
) => {
  const modifier = sortDir === "desc" ? -1 : 1;
  const sortField = sortBy.startsWith("fields.") ? sortBy.replace(/^fields\./, "") : sortBy;

  return [...rows].sort((a, b) => {
    if (a.type !== b.type) {
      return foldersFirst
        ? (a.type === "dir" ? -1 : 1)
        : (a.type === "file" ? -1 : 1);
    }

    const aValue = getSortableValue(a, sortField);
    const bValue = getSortableValue(b, sortField);
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * modifier;
    }

    const aDate = Date.parse(String(aValue));
    const bDate = Date.parse(String(bValue));
    if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
      return (aDate - bDate) * modifier;
    }

    return String(aValue).localeCompare(String(bValue), undefined, { numeric: true }) * modifier;
  });
};

const getSortableValue = (row: Record<string, any>, sortBy: string) => {
  if (sortBy === "name" || sortBy === "path") return row[sortBy];
  return safeAccess(row.fields, sortBy);
};
