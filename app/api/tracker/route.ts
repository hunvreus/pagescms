import { getAuth } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { historyTable } from "@/db/schema";
import { z } from "zod";

/**
 * Fetches and updates user's history of visits to repositories.
 * 
 * GET /api/tracker
 * POST /api/tracker
 * 
 * Requires authentication.
 */

export async function GET(request: Request) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const latestVisit = await db.query.historyTable.findFirst({
      where: eq(historyTable.userId, user.id),
      orderBy: [desc(historyTable.lastVisited)]
    });
    
    return Response.json({
      status: "success",
      data: latestVisit
    });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
}

export async function POST(request: Request) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const data: any = await request.json();
    
    const validation = z.object({
			owner: z.string().trim().min(1),
			repo: z.string().trim().min(1),
      branch: z.string().trim().min(1)
		}).safeParse({
			owner: data.owner,
			repo: data.repo,
      branch: data.branch
		});
		if (!validation.success) throw new Error ("Invalid parameters");

    // We update the history table
    const latestVisit = await db.query.historyTable.findFirst({
      where: and(
        eq(historyTable.owner, validation.data.owner),
        eq(historyTable.repo, validation.data.repo),
        eq(historyTable.userId, user.id)
      )
    });

    if (latestVisit) {
      await db.update(historyTable).set({
        lastVisited: Math.floor(Date.now() / 1000),
        branch: validation.data.branch
      }).where(
        and(
          eq(historyTable.owner, validation.data.owner),
          eq(historyTable.repo, validation.data.repo),
          eq(historyTable.userId, user.id)
        )
      );
    } else {
      await db.insert(historyTable).values({
        owner: validation.data.owner,
        repo: validation.data.repo,
        branch: validation.data.branch,
        lastVisited: Math.floor(Date.now() / 1000),
        userId: user.id
      });
    }

    return Response.json(null, { status: 200 });
  } catch (error: any) {
    console.error(error);
    return Response.json({
      status: "error",
      message: error.message,
    });
  }
}