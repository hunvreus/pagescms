import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessionTable } from "@/db/schema";

type AuthSession = {
  session?: {
    id?: string | null;
  } | null;
} | null | undefined;

const invalidateSessionForGithubAuthError = async (session: AuthSession) => {
  const sessionId = session?.session?.id;
  if (!sessionId) return;

  await db.delete(sessionTable).where(eq(sessionTable.id, sessionId));
};

export { invalidateSessionForGithubAuthError };
