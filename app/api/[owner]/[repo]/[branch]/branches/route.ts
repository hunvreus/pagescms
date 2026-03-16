import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken } from "@/lib/token";
import { toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Creates a new branch in a GitHub repository.
 * 
 * POST /api/[owner]/[repo]/[branch]/branches
 * 
 * Requires authentication.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo, true);
    if (!token) throw new Error("Token not found");

    const data: any = await request.json();
    if (!data.name) throw new Error(`"name" is required.`);

    const octokit = createOctokitInstance(token);

    // Get the SHA of the branch we're creating the new branch from
    const { data: refData } = await octokit.rest.git.getRef({
      owner: params.owner,
      repo: params.repo,
      ref: `heads/${params.branch}`,
    });
    const sha = refData.object.sha;

    // Create the new branch with the obtained SHA
    const response = await octokit.rest.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${data.name}`,
      sha,
    });

    return Response.json({
      status: "success",
      message: `Branch "${data.name}" created successfully from"${params.branch}".`,
      data: response.data,
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
