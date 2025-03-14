import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { writeFns } from "@/fields/registry";
import { configVersion, parseConfig, normalizeConfig } from "@/lib/config";
import { stringify } from "@/lib/serialization";
import { deepMap, getDefaultValue, generateZodSchema, getSchemaByName, sanitizeObject } from "@/lib/schema";
import { getConfig, updateConfig } from "@/lib/utils/config";
import { getFileExtension, getFileName, normalizePath, serializedTypes } from "@/lib/utils/file";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";

/**
 * Create, update and delete individual files in a GitHub repository.
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

    switch (data.type) {
      case "content":
        if (!data.name) throw new Error(`"name" is required for content.`);

        let schema = getSchemaByName(config?.object, data.name);
        if (!schema) throw new Error(`Schema not found for ${data.name}.`);

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

            // Hidden fields are stripped in the client, we add them back
            contentObject = deepMap(contentObject, contentFields, (value, field) => field.hidden ? getDefaultValue(field) : value);
            // TODO: fetch the entry and merge values
            
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

            const validatedContentObject = deepMap(zodValidation.data, contentFields, (value, field) => writeFns[field.type] ? writeFns[field.type](value, field, config || {}) : value);

            const sanitizedContentObject = schema.list
              ? sanitizeObject(validatedContentObject.listWrapper)
              : sanitizeObject(validatedContentObject);

            const stringifiedContentObject = stringify(
              sanitizedContentObject,
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
        if (!config?.object.media) throw new Error(`No media configuration found for ${params.owner}/${params.repo}/${params.branch}.`);

        if (!normalizedPath.startsWith(config.object.media.input)) throw new Error(`Invalid path "${params.path}" for media.`);
        
        if (getFileName(normalizedPath) === ".gitkeep") {
          // Folder creation
          contentBase64 = "";
        } else {
          if (
            config.object.media.extensions?.length > 0 &&
            !config.object.media.extensions.includes(getFileExtension(normalizedPath))
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

const githubSaveFile = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  contentBase64: string,
  sha?: string,
) => {
  const generateUniqueFilename = (path: string, attempt: number) => {
    const [filename, extension] = path.split(".");
    const baseName = `${filename}-${attempt}`;
    return `${baseName}.${extension}`;
  };

  let currentPath = path;
  let attempts = 0;
  const maxAttempts = sha ? 1 : 5;
  let uniqueFilenameCounter = 1;

  const octokit = createOctokitInstance(token);

  while (attempts < maxAttempts) {
    try {
      const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: currentPath,
        message: sha
          ? `Update ${currentPath} (via Pages CMS)`
          : `Create ${currentPath} (via Pages CMS)`,
        content: contentBase64,
        branch,
        sha: sha || undefined,
      });

      // TODO: is that really what I have to do here?
      if (response.data.content && response.data.commit) {
        return response;
      } else {
        throw new Error("Invalid response structure");
      }
    } catch (error: any) {
      if (error.status === 422 && maxAttempts && maxAttempts > 1) {
        attempts++;
        currentPath = generateUniqueFilename(path, uniqueFilenameCounter);
        uniqueFilenameCounter++;
      } else {
        throw error;
      }
    }
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
    
    switch (type) {
      case "content":
        if (!name) throw new Error(`"name" is required for content.`);

        const schema = getSchemaByName(config.object, name);
        if (!schema) throw new Error(`Schema not found for ${name}.`);
        
        if (!normalizedPath.startsWith(schema.path)) throw new Error(`Invalid path "${params.path}" for ${type} "${name}".`);
        
        if (getFileExtension(normalizedPath) !== schema.extension) throw new Error(`Invalid extension "${getFileExtension(normalizedPath)}" for ${type} "${name}".`);
        break;
      case "media":
        if (!config.object.media) throw new Error(`No media configuration found for ${params.owner}/${params.repo}/${params.branch}.`);
        if (!normalizedPath.startsWith(config.object.media.input)) throw new Error(`Invalid path "${params.path}" for media.`);

        if (
          config.object.media.extensions?.length > 0 &&
          !config.object.media.extensions.includes(getFileExtension(normalizedPath))
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