import { createOctokitInstance } from "@/lib/utils/octokit";
import { getConfig } from "@/lib/utils/config";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { getMediaCache, checkRepoAccess } from "@/lib/githubCache";

// Add docs

/**
 * Get the list of media files in a directory.
 *
 * GET /api/[owner]/[repo]/[branch]/media/[path]
 * 
 * Requires authentication.
 */

export async function GET(
  request: Request,
  { params }: { params: { owner: string, repo: string, branch: string, name: string, path: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    if (user.githubId) {
      const hasAccess = await checkRepoAccess(token, params.owner, params.repo, user.githubId);
      if (!hasAccess) throw new Error(`No access to repository ${params.owner}/${params.repo}.`);
    }

    const config = await getConfig(params.owner, params.repo, params.branch);
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);   
    
    const mediaConfig = config.object.media.find((item: any) => item.name === params.name) || config.object.media[0];

    if (!mediaConfig) {
      if (params.name) throw new Error(`No media configuration named "${params.name}" found for ${params.owner}/${params.repo}/${params.branch}.`);
      throw new Error(`No media configuration found for ${params.owner}/${params.repo}/${params.branch}.`);
    }

    const normalizedPath = normalizePath(params.path);
    if (!normalizedPath.startsWith(mediaConfig.input)) throw new Error(`Invalid path "${params.path}" for media "${params.name}".`);

    const { searchParams } = new URL(request.url);
    const nocache = searchParams.get('nocache');

    let results = await getMediaCache(params.owner, params.repo, params.branch, normalizedPath, token, !!nocache);

    if (mediaConfig.extensions && mediaConfig.extensions.length > 0) {
      results = results.filter((item) => {
        if (item.type === "dir") return true;
        const extension = getFileExtension(item.name);
        return mediaConfig.extensions.includes(extension);
      });
    }

    results.sort((a: any, b: any) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      } else {
        return a.type === "dir" ? -1 : 1;
      }
    });

    return Response.json({
      status: "success",
      data: results.map((item: any) => {
        return {
          type: item.type,
          sha: item.sha,
          name: item.name,
          path: item.path,
          extension: item.type === "dir" ? undefined : getFileExtension(item.name),
          size: item.size,
          url: item.downloadUrl
        };
      }),
    });
  } catch (error: any) {
    console.error(error);
    // TODO: better handling of GitHub errors
    return Response.json({
      status: "error",
      message: error.status === 404 ? "Not found" : error.message,
    });
  }
}