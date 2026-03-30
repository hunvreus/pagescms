import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { actionRunTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toSummary = (row: typeof actionRunTable.$inferSelect) => ({
  id: row.id,
  actionName: row.actionName,
  contextType: row.contextType,
  contextName: row.contextName,
  contextPath: row.contextPath,
  workflowRef: row.workflowRef,
  sha: row.sha,
  status: row.status,
  conclusion: row.conclusion,
  htmlUrl: row.htmlUrl,
  workflowRunId: row.workflowRunId,
  triggeredByName: (row.triggeredBy as { name?: string | null } | null)?.name ?? null,
  triggeredByEmail: (row.triggeredBy as { email?: string | null } | null)?.email ?? null,
  triggeredByGithubUsername: (row.triggeredBy as { githubUsername?: string | null } | null)?.githubUsername ?? null,
  triggeredByImage: (row.triggeredBy as { image?: string | null } | null)?.image ?? null,
  createdAt: row.createdAt?.toISOString() ?? null,
  updatedAt: row.updatedAt?.toISOString() ?? null,
  completedAt: row.completedAt?.toISOString() ?? null,
});

const findWorkflowRun = async (
  octokit: ReturnType<typeof createOctokitInstance>,
  row: typeof actionRunTable.$inferSelect,
  claimedRunIds: number[],
) => {
  const startedAtMs = row.createdAt.getTime();
  const claimedRunIdsSet = new Set(claimedRunIds);

  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: row.owner,
      repo: row.repo,
      workflow_id: row.workflow,
      branch: row.workflowRef,
      event: "workflow_dispatch",
      per_page: 10,
    });

    const run = response.data.workflow_runs
      .filter((item) => (
        Date.parse(item.created_at) >= startedAtMs - 30_000
        && !claimedRunIdsSet.has(item.id)
      ))
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];

    if (run) return run;
    await sleep(1500);
  }

  return null;
};

const getClaimedWorkflowRunIds = async (row: typeof actionRunTable.$inferSelect) => {
  const rows = await db.select({
    workflowRunId: actionRunTable.workflowRunId,
  }).from(actionRunTable).where(and(
    eq(actionRunTable.owner, row.owner),
    eq(actionRunTable.repo, row.repo),
    eq(actionRunTable.workflow, row.workflow),
    eq(actionRunTable.workflowRef, row.workflowRef),
    isNotNull(actionRunTable.workflowRunId),
    ne(actionRunTable.id, row.id),
  ));

  return rows
    .map((claimedRow) => claimedRow.workflowRunId)
    .filter((value): value is number => typeof value === "number");
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string; runId: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const runId = Number(params.runId);
    if (!Number.isFinite(runId)) {
      throw createHttpError("Invalid action run id.", 400);
    }

    const [row] = await db.select().from(actionRunTable).where(and(
      eq(actionRunTable.id, runId),
      eq(actionRunTable.owner, params.owner),
      eq(actionRunTable.repo, params.repo),
      eq(actionRunTable.ref, params.branch),
    ));

    if (!row) {
      throw createHttpError("Action run not found.", 404);
    }

    let syncedRow = row;

    if (row.status !== "completed") {
      const { token } = await getToken(user, params.owner, params.repo, true);
      const octokit = createOctokitInstance(token);
      if (!row.workflowRunId) {
        const workflowRun = await findWorkflowRun(
          octokit,
          row,
          await getClaimedWorkflowRunIds(row),
        );

        if (workflowRun) {
          const [updated] = await db.update(actionRunTable).set({
            workflowRunId: workflowRun.id,
            status: workflowRun.status ?? "queued",
            conclusion: workflowRun.conclusion,
            htmlUrl: workflowRun.html_url,
            updatedAt: new Date(),
            completedAt: workflowRun.status === "completed"
              ? new Date(workflowRun.updated_at)
              : null,
          }).where(eq(actionRunTable.id, row.id)).returning();

          if (updated) syncedRow = updated;
        }
      } else {
        const workflowRunResponse = await octokit.rest.actions.getWorkflowRun({
          owner: row.owner,
          repo: row.repo,
          run_id: row.workflowRunId,
        });

        const [updated] = await db.update(actionRunTable).set({
          status: workflowRunResponse.data.status ?? row.status,
          conclusion: workflowRunResponse.data.conclusion,
          htmlUrl: workflowRunResponse.data.html_url,
          updatedAt: new Date(),
          completedAt: workflowRunResponse.data.status === "completed"
            ? new Date(workflowRunResponse.data.updated_at)
            : null,
        }).where(eq(actionRunTable.id, row.id)).returning();

        if (updated) syncedRow = updated;
      }
    }

    return Response.json({
      status: "success",
      message: "Action run fetched successfully.",
      data: toSummary(syncedRow),
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
