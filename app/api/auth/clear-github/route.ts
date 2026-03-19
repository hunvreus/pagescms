import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountTable, userTable } from "@/db/schema";
import { requireApiUserSession } from "@/lib/session-server";
import { toErrorResponse } from "@/lib/api-error";

export async function POST() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const userId = sessionResult.user.id;

    await db.transaction(async (tx) => {
      await tx.delete(accountTable).where(
        and(
          eq(accountTable.userId, userId),
          eq(accountTable.providerId, "github"),
        )
      );

      await tx.update(userTable)
        .set({ githubUsername: null })
        .where(eq(userTable.id, userId));
    });

    return Response.json({ status: "success" });
  } catch (error) {
    return toErrorResponse(error);
  }
}
