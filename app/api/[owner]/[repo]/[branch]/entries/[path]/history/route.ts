import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getSchemaByName } from "@/lib/schema";
import { getConfig } from "@/lib/utils/config";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { assertGithubIdentity } from "@/lib/authz";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Fetches the history of a file from GitHub repositories.
 * 
 * GET /api/[owner]/[repo]/[branch]/entries/[path]/history
 * 
 * Requires authentication.
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
    const name = searchParams.get("name") || "";
    
    const normalizedPath = normalizePath(params.path);
    if (normalizedPath === ".pages.yml") {
      assertGithubIdentity(user, "Only GitHub users can access settings history.");
    }
    
    if (name) {
      const config = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      if (!config) throw createHttpError(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);
      
      const schema = getSchemaByName(config.object, name);
      if (!schema) throw createHttpError(`Schema not found for ${name}.`, 404);

      if (!normalizedPath.startsWith(schema.path)) throw createHttpError(`Invalid path "${params.path}" for ${schema.type} "${name}".`, 400);

      if (getFileExtension(normalizedPath) !== schema.extension) {
        throw createHttpError(`Invalid extension "${getFileExtension(normalizedPath)}" for ${schema.type} "${name}".`, 400);
      }
    } else if (normalizedPath !== ".pages.yml") {
      throw createHttpError("If no content entry name is provided, the path must be \".pages.yml\".", 400);
    }
    
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.listCommits({
      owner: params.owner,
      repo: params.repo,
      path: decodeURIComponent(normalizedPath),
      sha: params.branch,
    });

    return Response.json({
      status: "success",
      data: response.data
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
