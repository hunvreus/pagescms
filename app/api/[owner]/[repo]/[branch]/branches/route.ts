import { createOctokitInstance } from "@/lib/utils/octokit";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";

/**
 * Creates a new branch in a GitHub repository.
 * 
 * POST /api/[owner]/[repo]/[branch]/branches
 * 
 * Requires authentication.
 */

export async function POST(
  request: Request,
  { params }: { params: { owner: string, repo: string, branch: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
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
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
}