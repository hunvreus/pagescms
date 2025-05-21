import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { writeFns } from "@/fields/registry";
import { configVersion, parseConfig, normalizeConfig } from "@/lib/config";
import { stringify, parse } from "@/lib/serialization";
import { deepMap, generateZodSchema, getSchemaByName, sanitizeObject } from "@/lib/schema";
import { getConfig, updateConfig } from "@/lib/utils/config";
import { getFileExtension, getFileName, normalizePath, serializedTypes, getParentPath } from "@/lib/utils/file";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { updateFileCache } from "@/lib/githubCache";
import { deepMergeObjects } from "@/lib/helpers";
import { ConsoleLogWriter } from "drizzle-orm";

/**
 * Create, update and delete individual files in a GitHub repository.
 * 
 * POST /api/[owner]/[repo]/[branch]/files/[path]
 * DELETE /api/[owner]/[repo]/[branch]/files/[path]
 * 
 * Requires authentication.
 */

export async function POST(
  request: Request,
  { params }: { params: { owner: string, repo: string, branch: string, path: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    const normalizedPath = normalizePath(params.path);

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config && normalizedPath !== ".pages.yml") throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const data: any = await request.json();

    let contentBase64;
    let schema;

    switch (data.type) {
      case "content":
        if (!data.name) throw new Error(`"name" is required for content.`);

        schema = getSchemaByName(config?.object, data.name);
        if (!schema) throw new Error(`Content schema not found for ${data.name}.`);

        if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${params.path}" for ${data.type} "${data.name}".`);

        if (getFileName(normalizedPath) === ".gitkeep") {
          // Folder creation
          contentBase64 = "";
        } else {
          if (getFileExtension(normalizedPath) !== schema.extension) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${data.type} "${data.name}".`);

          if (serializedTypes.includes(schema.format) && schema.fields) {
            let contentFields;
            let contentObject;

            // Wrapping things in listWrapper to deal with lists at the root
            if (schema.list) {
              contentObject = { listWrapper: data.content };
              contentFields = [{
                name: "listWrapper",
                type: "object",
                list: true,
                fields: schema.fields
              }]
            } else {
              contentObject = data.content;
              contentFields = schema.fields;
            }
            
            // Use mapBlocks to convert config blocks array to a map
            const zodSchema = generateZodSchema(contentFields);
            const zodValidation = zodSchema.safeParse(contentObject);
            
            if (zodValidation.success === false ) {
              const errorMessages = zodValidation.error.errors.map((error: any) => {
                let message = error.message;
                if (error.path.length > 0) message = `${message} at ${error.path.join(".")}`;
                return message;
              });
              throw new Error(`Content validation failed: ${errorMessages.join(", ")}`);
            }

            const validatedContentObject = deepMap(
              zodValidation.data,
              contentFields,
              (value, field) => {
                const fieldType = field.type as string;
                return writeFns[fieldType] ? writeFns[fieldType](value, field, config || {}) : value;
              }
            );

            const unwrappedContentObject = schema.list
              ? validatedContentObject.listWrapper
              : validatedContentObject;

            let finalContentObject = JSON.parse(JSON.stringify(unwrappedContentObject));

            if (config?.object?.settings?.content?.merge && data.sha) {
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

              const existingContent = Buffer.from(response.data.content, "base64").toString();
              const existingContentObject = parse(existingContent, { format: schema.format, delimiters: schema.delimiters });

              finalContentObject = deepMergeObjects(unwrappedContentObject, existingContentObject);
            }
            
            const stringifiedContentObject = stringify(
              sanitizeObject(finalContentObject),
              {
                format: schema.format,
                delimiters: schema.delimiters
              }
            );
            contentBase64 = Buffer.from(stringifiedContentObject).toString("base64");
          } else {
            contentBase64 = Buffer.from(data.content.body ?? "").toString("base64");
          }
        }
        break;
      case "media":
        if (!data.name) throw new Error(`"name" is required for media.`);

        schema = getSchemaByName(config?.object, data.name, "media");
        if (!schema) throw new Error(`Media schema not found for ${data.name}.`);

        if (!normalizedPath.startsWith(schema.input)) throw new Error(`Invalid path "${params.path}" for media "${data.name}".`);
        
        if (getFileName(normalizedPath) === ".gitkeep") {
          // Folder creation
          contentBase64 = "";
        } else {
          if (
            schema.extensions?.length > 0 &&
            !schema.extensions.includes(getFileExtension(normalizedPath))
          ) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for media.`);

          contentBase64 = data.content;
        }
        break;
      case "settings":
        if (normalizedPath !== ".pages.yml") throw new Error(`Invalid path "${params.path}" for settings.`);

        contentBase64 = Buffer.from(data.content.body ?? "").toString("base64");
        break;
      default:
        throw new Error(`Invalid type "${data.type}".`);
    }
    
    const response = await githubSaveFile(token, params.owner, params.repo, params.branch, normalizedPath, contentBase64, data.sha);
  
    const savedPath = response?.data.content?.path;

    let newConfig;
    if (data.type === "settings") {
      const parsedConfig = parseConfig(data.content.body ?? "");
      const configObject = normalizeConfig(parsedConfig.document.toJSON());
      newConfig = {
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        sha: response?.data.content?.sha as string,
        version: configVersion ?? "0.0",
        object: configObject
      };
      
      await updateConfig(newConfig);
    }
    
    if (response?.data.content && response?.data.commit) {
      // If the file is successfully saved, update the cache
      await updateFileCache(
        data.type === 'content' ? 'collection' : 'media',
        params.owner,
        params.repo,
        params.branch,
        {
          type: data.sha ? 'modify' : 'add',
          path: response.data.content.path!,
          sha: response.data.content.sha!,
          content: Buffer.from(contentBase64, 'base64').toString('utf-8'),
          size: response.data.content.size,
          downloadUrl: response.data.content.download_url,
          commit: {
            sha: response.data.commit.sha!,
            timestamp: new Date(response.data.commit.committer?.date ?? new Date().toISOString()).getTime()
          }
        }
      );
    }

    return Response.json({
      status: "success",
      message: savedPath !== normalizedPath
        ? `File "${normalizedPath}" saved successfully but renamed to "${savedPath}" to avoid naming conflict.`
        : `File "${normalizedPath}" saved successfully.`,
      data: {
        type: response?.data.content?.type,
        sha: response?.data.content?.sha,
        name: response?.data.content?.name,
        path: savedPath,
        extension: getFileExtension(response?.data.content?.name || ""),
        size: response?.data.content?.size,
        url: response?.data.content?.download_url,
        config: newConfig ?? undefined,
      }
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
};

// Helper function to save a file to GitHub (with retry logic for new files)
const githubSaveFile = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  contentBase64: string,
  sha?: string,
) => {
  // We disable retries for 409 errors as it means the file has changed (conflict on SHA)
  const octokit = createOctokitInstance(token, { retry: { doNotRetry: [409] } });
  
  try {
    // First attempt: try with original path
    const response = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: sha ? `Update ${path} (via Pages CMS)` : `Create ${path} (via Pages CMS)`,
      content: contentBase64,
      branch,
      sha: sha || undefined,
    });

    if (response.data.content && response.data.commit) {
      return response;
    }
    throw new Error("Invalid response structure");
  } catch (error: any) {
    if (error.status === 409) {
      error.message = "File has changed since you last loaded it. Please refresh the page and try again.";
    }

    // Only handle 422 errors for new files (no sha)
    if (error.status === 422 && !sha) {
      // Get directory contents to find next available name
      const parentDir = getParentPath(path);
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: parentDir || '.',
        ref: branch,
      });

      if (!Array.isArray(data)) {
        throw new Error('Expected directory listing');
      }

      const [filename, extension] = path.split('/').pop()!.split('.');
      const pattern = new RegExp(`^${filename}-(\\d+)\\.${extension}$`);
      const maxNumber = Math.max(0, ...data
        .map(file => {
          const match = file.name.match(pattern);
          return match ? parseInt(match[1], 10) : 0;
        }));

      // Try up to 3 times with incrementing numbers
      for (let i = 1; i <= 3; i++) {
        const newPath = `${parentDir ? parentDir + '/' : ''}${filename}-${maxNumber + i}.${extension}`;
        try {
          const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: newPath,
            message: `Create ${newPath} (via Pages CMS)`,
            content: contentBase64,
            branch,
          });

          if (response.data.content && response.data.commit) {
            return response;
          }
        } catch (error: any) {
          if (i === 3 || error.status !== 422) throw error;
          // Continue to next attempt if 422 (file already exists)
        }
      }
    }
    throw error;
  }
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: { owner: string, repo: string, branch: string, path: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    if (params.path === ".pages.yml") throw new Error(`Deleting the settings file isn't allowed.`);

    const searchParams = request.nextUrl.searchParams;
    const sha = searchParams.get("sha");
    const type = searchParams.get("type");
    const name = searchParams.get("name");

    if (!type || !["content", "media"].includes(type)) throw new Error(`"type" is required and must be set to "content" or "media".`);
    if (!name && type === "content") throw new Error(`"name" is required.`);
    if (!sha) throw new Error(`"sha" is required.`);

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);

    const normalizedPath = normalizePath(params.path);
    let schema;

    switch (type) {
      case "content":
        if (!name) throw new Error(`"name" is required for content.`);

        schema = getSchemaByName(config.object, name);
        if (!schema) throw new Error(`Content schema not found for ${name}.`);
        
        if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${params.path}" for ${type} "${name}".`);
        
        if (getFileExtension(normalizedPath) !== schema.extension) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${type} "${name}".`);
        break;
      case "media":
        if (!name) throw new Error(`"name" is required for media.`);

        schema = getSchemaByName(config.object, name, "media");
        if (!schema) throw new Error(`Media schema not found for ${name}.`);

        if (!normalizedPath.startsWith(schema.input)) throw new Error(`Invalid path "${params.path}" for media "${name}".`);

        if (
          schema.extensions?.length > 0 &&
          !schema.extensions.includes(getFileExtension(normalizedPath))
        ) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for media.`);
        break;
    }
    
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.deleteFile({
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      path: params.path,
      sha: sha,
      message: `Delete ${params.path} (via Pages CMS)`,
    });

    // Update cache after successful deletion
    await updateFileCache(
      'collection',
      params.owner,
      params.repo,
      params.branch,
      {
        type: 'delete',
        path: params.path
      }
    );

    return Response.json({
      status: "success",
      message: `File "${normalizedPath}" deleted successfully.`,
      data: {
        sha: response?.data.commit.sha,
        name: response?.data.content?.name,
        path: response?.data.content?.path,
      }
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
};