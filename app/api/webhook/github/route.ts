import { headers } from "next/headers";
import crypto from "crypto";
import { db } from "@/db";
import { collaboratorTable, githubInstallationTokenTable } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { normalizePath } from "@/lib/utils/file";
import { 
  updateMultipleFilesCache, 
  clearFileCache,
  updateFileCacheRepository,
  updateFileCacheOwner
} from "@/lib/githubCache";
import { getInstallationToken } from "@/lib/token";

/**
 * Handles GitHub webhooks:
 * - Maintains tables related to GitHub installations (e.g. collaborators,
 *   installation tokens)
 * - Maintains GitHub cache (both files and permissions)
 * 
 * POST /api/webhook/github
 * 
 * Requires GitHub App webhook secret and signature.
 */

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

    try {
      switch (event) {
        case "installation":
          if (data.action === "deleted") {
            // App uninstalled
            const accountLogin = data.installation?.account?.login;
            
            if (!accountLogin) {
              console.error("Missing account login in installation deleted event", data.installation);
              break;
            }
            
            await Promise.all([
              db.delete(collaboratorTable).where(
                eq(collaboratorTable.installationId, data.installation.id)
              ),
              db.delete(githubInstallationTokenTable).where(
                eq(githubInstallationTokenTable.installationId, data.installation.id)
              ),
              clearFileCache(accountLogin)
            ]);
          }
          break;
          
        case "installation_repositories":
          if (data.action === "removed") {
            // Repositories removed from installation
            const reposIdRemoved = data.repositories_removed?.map((repo: any) => repo.id) || [];
            if (reposIdRemoved.length === 0) break;
            
            await db.delete(collaboratorTable).where(
              inArray(collaboratorTable.repoId, reposIdRemoved)
            );
            
            await Promise.all(
              (data.repositories_removed || []).map((repo: any) => {
                // full_name format is "owner/repo"
                const [owner, repoName] = (repo.full_name || "").split('/');
                if (owner && repoName) {
                  return clearFileCache(owner, repoName);
                }
                return Promise.resolve();
              })
            );
          }
          break;
          
        case "repository":
          const owner = data.repository?.owner?.login;  
          const repoName = data.repository?.name;       
          const repoId = data.repository?.id;
          
          if (!owner || !repoName || !repoId) {
            console.error("Missing repository data in webhook", { owner, repoName, repoId });
            break;
          }
          
          if (data.action === "deleted") {
            // Repository deleted
            await Promise.all([
              db.delete(collaboratorTable).where(
                eq(collaboratorTable.repoId, repoId)
              ),
              clearFileCache(owner, repoName)
            ]);
          } else if (data.action === "transferred") {
            // Repository transferred
            const oldOwner = data.changes?.owner?.from?.login || owner;
            
            await Promise.all([
              db.delete(collaboratorTable).where(
                eq(collaboratorTable.repoId, repoId)
              ),
              clearFileCache(oldOwner, repoName)
            ]);
          } else if (data.action === "renamed") {
            // Repository renamed
            const oldName = data.changes?.repository?.name?.from;
            if (!oldName) {
              console.error("Missing old repository name in rename event");
              break;
            }
            
            await Promise.all([
              db.update(collaboratorTable).set({
                repo: repoName
              }).where(
                eq(collaboratorTable.repoId, repoId)
              ),
              updateFileCacheRepository(owner, oldName, repoName)
            ]);
          }
          break;
          
        case "installation_target":
          if (data.action === "renamed") {
            // Account renamed
            const oldOwner = data.changes?.login?.from;
            const newOwner = data.account?.login;
            const accountId = data.account?.id;
            
            if (!oldOwner || !newOwner || !accountId) {
              console.error("Missing account rename data in webhook", { oldOwner, newOwner, accountId });
              break;
            }
            
            await Promise.all([
              db.update(collaboratorTable).set({
                owner: newOwner
              }).where(
                eq(collaboratorTable.ownerId, accountId)
              ),
              updateFileCacheOwner(oldOwner, newOwner)
            ]);
          }
          break;
          
        case "delete":
          // Branch deleted
          if (data.ref_type === "branch") {
            const deleteOwner = data.repository?.owner?.login;
            const deleteRepo = data.repository?.name;
            const deleteBranch = data.ref?.replace('refs/heads/', '');
            
            if (!deleteOwner || !deleteRepo || !deleteBranch) {
              console.error("Missing branch deletion data in webhook", { deleteOwner, deleteRepo, deleteBranch });
              break;
            }
            
            await clearFileCache(deleteOwner, deleteRepo, deleteBranch);
          }
          break;
          
        case "push":
          // Files changed (added, modified, removed)
          if (data.deleted === true) {
            // Skip cache updates for branch deletions (they're handled by the "delete" event)
            break;
          }

          const pushOwner = data.repository.owner.login;
          const pushRepo = data.repository.name;
          const pushBranch = data.ref.replace('refs/heads/', '');
          
          const removedFiles = data.commits.flatMap((commit: any) => 
            (commit.removed || []).map((path: string) => ({ 
              path: normalizePath(path) 
            }))
          );
          
          const modifiedFiles = data.commits.flatMap((commit: any) => 
            (commit.modified || []).map((path: string) => ({
              path: normalizePath(path),
              sha: commit.id
            }))
          );

          const addedFiles = data.commits.flatMap((commit: any) => 
            (commit.added || []).map((path: string) => ({
              path: normalizePath(path),
              sha: commit.id
            }))
          );

          const installationToken = await getInstallationToken(pushOwner, pushRepo);

          const commit = {
            sha: data.head_commit.id,
            timestamp: new Date(data.head_commit.timestamp).getTime()
          };

          await updateMultipleFilesCache(
            pushOwner,
            pushRepo,
            pushBranch,
            removedFiles,
            modifiedFiles,
            addedFiles,
            installationToken,
            commit
          );
          break;
      }
    } catch (error: any) {
      // TODO: log for remediation (maybe invalidate cache to be safe)
      console.error("Error in Webhook", {
        error,
        event,
        payload: data,
        action: data?.action
      });
    }
    
    return Response.json(null, { status: 200 });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return Response.json(null, { status: 500 });
  }
}
