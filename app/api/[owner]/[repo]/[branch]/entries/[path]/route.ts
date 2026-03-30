import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { readFns } from "@/fields/registry";
import { deepMap, getSchemaByName } from "@/lib/schema";
import { parse } from "@/lib/serialization";
import { getConfig } from "@/lib/utils/config";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { assertGithubIdentity } from "@/lib/authz";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Fetches and parses individual file contents from GitHub repositories
 * (usually for editing).
 * 
 * GET /api/[owner]/[repo]/[branch]/entries/[path]?name=[schemaName]
 * 
 * Requires authentication. If no schema name is provided, we return the raw
 * contents.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");
    const metaOnly =
      searchParams.get("meta") === "true" ||
      searchParams.get("meta") === "1";
    
    const normalizedPath = normalizePath(params.path);
    if (normalizedPath === ".pages.yml") {
      assertGithubIdentity(user, "Only GitHub users can access settings.");
    }

    if (!name && normalizedPath !== ".pages.yml") {
      throw createHttpError("If no content entry name is provided, the path must be \".pages.yml\".", 400);
    }

    if (!name && normalizedPath === ".pages.yml" && metaOnly) {
      const cachedConfig = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      return Response.json({
        status: "success",
        data: {
          sha: cachedConfig?.sha ?? null,
          version: cachedConfig?.version ?? null,
          lastCheckedAt: cachedConfig?.lastCheckedAt ?? null,
        },
      });
    }

    let config;
    let schema;

    if (name) {
      config = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      if (!config) throw createHttpError(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);

      schema = getSchemaByName(config.object, name);
      if (!schema) throw createHttpError(`Schema not found for ${name}.`, 404);

      if (!normalizedPath.startsWith(schema.path)) throw createHttpError(`Invalid path "${params.path}" for ${schema.type} "${name}".`, 400);

      const extension = schema.extension ?? "";
      if (getFileExtension(normalizedPath) !== extension) {
        throw createHttpError(`Invalid extension "${getFileExtension(normalizedPath)}" for ${schema.type} "${name}".`, 400);
      }
    } else {
      config = {};
    }
    
    const octokit = createOctokitInstance(token);
    let response;
    try {
      response = await octokit.rest.repos.getContent({
        owner: params.owner,
        repo: params.repo,
        path: normalizedPath,
        ref: params.branch
      });
    } catch (error: any) {
      if (error?.status === 404) {
        throw createHttpError("Not found", 404);
      }
      throw error;
    }
    
    if (Array.isArray(response.data)) {
      throw createHttpError("Expected a file but found a directory", 400);
    } else if (response.data.type !== "file") {
      throw createHttpError("Invalid response type", 500);
    }

    const content = Buffer.from(response.data.content, "base64").toString();
    const contentObject = name
      ? parseContent(content, schema, config)
      : { body: content };

    return Response.json({
      status: "success",
      data: {
        sha: response.data.sha,
        name: response.data.name,
        path: response.data.path,
        contentObject
      }
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}

// Parse the entry into an object based on the content schema.
const parseContent = (
  content: string,
  schema: Record<string, any>,
  config: Record<string, any>
) => {
  const serializedTypes = ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml"];
  
  let contentObject: Record<string, any> = {};

  if (serializedTypes.includes(schema && schema.format) && schema.fields && schema.fields.length > 0) {
    // If we are dealing with a serialized format and we have fields defined
    try {
      contentObject = parse(content, { format: schema.format, delimiters: schema.delimiters });
      // We resort to the same trick as with the client, wrapping things in a listWrapper object if we're dealing with a list at the root
      let entryFields;
      if (schema.list) {
        contentObject = { listWrapper: contentObject };
        entryFields = [{
          name: "listWrapper",
          type: "object",
          list: true,
          fields: schema.fields
        }]
      } else {
        entryFields = schema.fields;
      }

      contentObject = deepMap(
        contentObject,
        entryFields,
        (value, field) => {
          const type = field.type;
          if (typeof type === 'string' && readFns[type]) {
            return readFns[type](value, field, config);
          }
          return value;
        }
      );
      if (schema.list) contentObject = contentObject.listWrapper;
    } catch (error: any) {
      throw createHttpError(`Error parsing frontmatter: ${error.message}`, 400);
    }
  } else {
    contentObject = { body: content };
  }
  
  return contentObject; 
};
