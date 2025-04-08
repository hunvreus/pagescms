import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { readFns } from "@/fields/registry";
import { deepMap, getSchemaByName } from "@/lib/schema";
import { parse } from "@/lib/serialization";
import { getConfig } from "@/lib/utils/config";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";

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
  { params }: { params: { owner: string, repo: string, branch: string, path: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");
    
    const normalizedPath = normalizePath(params.path);

    if (!name && normalizedPath !== ".pages.yml") throw new Error("If no content entry name is provided, the path must be \".pages.yml\".");

    let config;
    let schema;

    if (name) {
      config = await getConfig(params.owner, params.repo, params.branch);
      if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);

      schema = getSchemaByName(config.object, name);
      if (!schema) throw new Error(`Schema not found for ${name}.`);

      if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${params.path}" for ${schema.type} "${name}".`);

      if (getFileExtension(normalizedPath) !== schema.extension) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${schema.type} "${name}".`);
    } else {
      config = {};
    }
    
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: normalizedPath,
      ref: params.branch
    });
    
    if (Array.isArray(response.data)) {
      throw new Error("Expected a file but found a directory");
    } else if (response.data.type !== "file") {
      throw new Error("Invalid response type");
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
    return Response.json({
      status: "error",
      message: error.status === 404 ? "Not found" : error.message,
    });
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
          if (field.hidden) return;
          const type = field.type;
          if (typeof type === 'string' && readFns[type]) {
            return readFns[type](value, field, config);
          }
          return value;
        }
      );
      if (schema.list) contentObject = contentObject.listWrapper;
    } catch (error: any) {
      throw new Error(`Error parsing frontmatter: ${error.message}`);
    }
  } else {
    contentObject = { body: content };
  }
  
  return contentObject; 
};