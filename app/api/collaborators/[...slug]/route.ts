import { type NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { requireGithubRepoWriteAccess } from "@/lib/authz-server";
import { toErrorResponse } from "@/lib/api-error";

/**
 * Fetches collaborators for a repository.
 * 
 * GET /api/collaborators/[owner]/[repo]
 * 
 * Requires authentication. Only accessible to GitHub users (not collaborators).
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
) {
  try {
    const params = await context.params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) return new Response(null, { status: 401 });

    // TODO: support for branches and account collaborators
    if (!params.slug || params.slug.length !== 2) throw new Error("Invalid slug: owner and repo are mandatory");

    const owner = params.slug[0];
		const repo = params.slug[1];

    const { repoAccess } = await requireGithubRepoWriteAccess(
      session.user,
      owner,
      repo,
      "Only GitHub users can manage collaborators.",
    );
    
    const collaborators = await db.query.collaboratorTable.findMany({
      where: and(
        eq(collaboratorTable.ownerId, repoAccess.ownerId),
        eq(collaboratorTable.repoId, repoAccess.repoId)
      )
    });
    
    return Response.json({
      status: "success",
      data: collaborators,
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
};
