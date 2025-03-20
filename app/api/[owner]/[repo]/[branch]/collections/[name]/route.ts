export const maxDuration = 30;

import { type NextRequest } from "next/server";
import { readFns } from "@/fields/registry";
import { parse } from "@/lib/serialization";
import { deepMap, getDateFromFilename, getSchemaByName, safeAccess } from "@/lib/schema";
import { getConfig } from "@/lib/utils/config";
import { normalizePath } from "@/lib/utils/file";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { getCachedCollection } from "@/lib/githubCache";

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
  { params }: { params: { owner: string, repo: string, branch: string, name: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const schema = getSchemaByName(config.object, params.name);
    if (!schema) throw new Error(`Schema not found for ${params.name}.`);

    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get("path") || "";
    const type = searchParams.get("type");
    const query = searchParams.get("query") || "";
    const fields = searchParams.get("fields")?.split(",") || ["name"];

    const normalizedPath = normalizePath(path);
    if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${path}" for collection "${params.name}".`);

    if (schema.subfolders === false) {
      if (normalizedPath !== schema.path) throw new Error(`Invalid path "${path}" for collection "${params.name}".`);
    }

    let entries = await getCachedCollection(params.owner, params.repo, params.branch, normalizedPath, token);
    
    let data: {
      contents: Record<string, any>[],
      errors: string[]
    } = {
      contents: [],
      errors: []
    };
    
    if (entries) {
      data = parseContents(entries, schema, config);
      
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
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
}

// Parse the list of entries into objects based on the content schema.
const parseContents = (
  contents: any,
  schema: Record<string, any>,
  config: Record<string, any>,
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
          contentObject = parse(item.content, { format: schema.format, delimiters: schema.delimiters });
          contentObject = deepMap(contentObject, schema.fields, (value, field) => readFns[field.type] ? readFns[field.type](value, field, config) : value);
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
        path: item.path,
        content: item.content,
        fields: contentObject,
        type: "file",
      };
    } else if (item.type === "dir" && !excludedFiles.includes(item.name) && schema.subfolders !== false) {
      return {
        name: item.name,
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