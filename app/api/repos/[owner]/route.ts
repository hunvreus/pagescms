import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getAuth } from "@/lib/auth";
import { getInstallations, getInstallationRepos } from "@/lib/githubApp";
import { getUserToken } from "@/lib/token";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { collaboratorTable } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Fetches repositories for a user.
 * 
 * GET /api/repos/[owner]
 * 
 * Requires authentication.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    let repos: any[] = [];

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");

    if (user.githubId) {
      const token = await getUserToken();
      if (!token) throw new Error("Token not found");

      const repositorySelection = searchParams.get("repository_selection");

      if (repositorySelection === "selected") {  
        // Only some repos are selected
        // TODO: investigate why it's slow
        const installations = await getInstallations(token, [params.owner]);
        if (installations.length !== 1) throw new Error(`"${params.owner}" is not part of your GitHub App installations`);

        repos =  await getInstallationRepos(token, installations[0].id);
      } else {
        // All repos are selected, we search for the repos based on parameters
        const keyword = searchParams.get("keyword");
        
        const octokit = createOctokitInstance(token);
        const query = `${keyword} in:name ${type}:${params.owner} fork:true`;
        const response = await octokit.rest.search.repos({
          q: query,
          sort: "updated",
          order: "desc",
          per_page: 5
        });
        repos = response.data.items;
      }

      repos = repos.filter(repo => repo.permissions.push).map(repo => ({
        owner: repo.owner.login,
        repo: repo.name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
      }));
    } else {
      repos = await db.query.collaboratorTable.findMany({
        where: and(
          eq(collaboratorTable.email, user.email),
          eq(collaboratorTable.owner, params.owner)
        )
      });
    }

    return Response.json({
      status: "success",
      data: repos,
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
}