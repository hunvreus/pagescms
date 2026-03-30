export const maxDuration = 30;

import { type NextRequest } from "next/server";
import { readFns } from "@/fields/registry";
import { parse } from "@/lib/serialization";
import { deepMap, getDateFromFilename, getFieldByPath, getSchemaByName, safeAccess } from "@/lib/schema";
import { getConfig } from "@/lib/utils/config";
import { normalizePath } from "@/lib/utils/file";
import { getToken } from "@/lib/token";
import { getCollectionCache, checkRepoAccess } from "@/lib/github-cache";
import { getGithubId } from "@/lib/github-account";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

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
    const path = searchParams.get("path") || "";
    const type = searchParams.get("type");
    const query = searchParams.get("query") || "";
    const fields = searchParams.get("fields")?.split(",") || ["name"];

    const normalizedPath = normalizePath(path);
    if (!normalizedPath.startsWith(schema.path)) throw createHttpError(`Invalid path "${path}" for collection "${params.name}".`, 400);

    if (schema.subfolders === false) {
      if (normalizedPath !== schema.path) throw createHttpError(`Invalid path "${path}" for collection "${params.name}".`, 400);
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
      data = parseContents(entries, schema, config, fields);
      
      // If this is a search request, filter the contents
      if (type === "search" && query) {
        const searchQuery = query.toLowerCase();
        const searchFields = Array.isArray(fields) ? fields : fields ? [fields] : [];
        
        data.contents = data.contents.filter(item => {
          if (searchFields.length === 0) {
            if (
              (item.name && item.name.toLowerCase().includes(searchQuery)) ||
              (item.path && item.path.toLowerCase().includes(searchQuery))
            ) {
              return true;
            }

            return item.content && item.content.toLowerCase().includes(searchQuery);
          }
          
          return searchFields.some(field => {
            if (field === 'name' || field === 'path') {
              const value = item[field];
              return value && String(value).toLowerCase().includes(searchQuery);
            }
            
            if (field.startsWith('fields.')) {
              const fieldPath = field.replace('fields.', '');
              const value = safeAccess(item.fields, fieldPath);
              return value && String(value).toLowerCase().includes(searchQuery);
            }
            
            return false;
          });
        });
      }
    }

    return Response.json({
      status: "success",
      data
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
  const extension = schema.extension ?? "";

  let parsedContents: Record<string, any>[] = [];
  let parsedErrors: string[] = [];

  parsedContents = contents.map((item: any) => {
    // If it's a file and it matches the schema extension
    if (item.type === "file" && (extension === "" || item.path.endsWith(`.${extension}`)) && !excludedFiles.includes(item.name)) {
      let contentObject: Record<string, any> = {};
      
      if (serializedTypes.includes(schema.format) && schema.fields) {
        // If we are dealing with a serialized format and we have fields defined
        try {
          const parsedObject = parse(item.content, { format: schema.format, delimiters: schema.delimiters });
          if (Array.isArray(selectedFields) && selectedFields.length > 0) {
            const requestedFieldPaths = selectedFields
              .filter((fieldPath) => fieldPath !== "path")
              .map((fieldPath) => fieldPath.startsWith("fields.") ? fieldPath.replace(/^fields\./, "") : fieldPath);
            contentObject = pickAndTransformFields(parsedObject, schema.fields, requestedFieldPaths, config);
          } else {
            // TODO: review if this works for blocks
            contentObject = deepMap(parsedObject, schema.fields, (value, field) => {
              if (typeof field.type === "string" && readFns[field.type]) {
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
        content: item.content,
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
