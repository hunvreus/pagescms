import { headers } from "next/headers";
import crypto from "crypto";
import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("X-Hub-Signature-256");
    const body = await request.text();
    const hmac = crypto.createHmac("sha256", process.env.GITHUB_APP_WEBHOOK_SECRET!);
    const digest = `sha256=${hmac.update(body).digest("hex")}`;

    if (signature !== digest) throw new Error("Invalid signature");

    const data = JSON.parse(body);

    const headersList = headers();
    const event = headersList.get("X-GitHub-Event");

    // TODO: potentially disable collaborators rather than delete, so that they can be re-instated again (e.g. uninstall/reinstall app, transfer repo, etc)
    try {
      switch (event) {
        case "installation":
          if (data.action === "deleted") {
            await db.delete(collaboratorTable).where(
              eq(collaboratorTable.installationId, data.installation.id)
            );
          }
          break;
        case "installation_repositories":
          if (data.action === "removed") {
            const reposIdRemoved = data.repositories_removed.map((repo: any) => repo.id);
            if (reposIdRemoved.length === 0) break;
            await db.delete(collaboratorTable).where(
              inArray(collaboratorTable.repoId, reposIdRemoved)
            );
          }
          break;
        case "repository":
          if (data.action === "deleted" || data.action === "transferred") {
            await db.delete(collaboratorTable).where(
              eq(collaboratorTable.repoId, data.repository.id)
            );
          } else if (data.action === "renamed") {
            await db.update(collaboratorTable).set({
              repo: data.repository.name
            }).where(
              eq(collaboratorTable.repoId, data.repository.id)
            );
          }
          break;
        case "installation_target":
          if (data.action === "renamed") {
            await db.update(collaboratorTable).set({
              owner: data.account.login
            }).where(
              eq(collaboratorTable.ownerId, data.account.id)
            );
          }
          break;
      }
    } catch (error: any) {
      // TODO: this may need to be logged for remediation since the DB must be accurate
      console.error("Error in Webhook", error);
    }
    
    return Response.json(null, { status: 200 });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return Response.json(null, { status: 500 });
  }
}
