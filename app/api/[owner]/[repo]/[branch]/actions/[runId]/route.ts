import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { actionRunTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { resolveActionRef } from "@/lib/repo-actions";
import { hasGithubIdentity } from "@/lib/authz";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toSummary = (
  row: typeof actionRunTable.$inferSelect,
  user: { id: string; githubUsername?: string | null },
) => ({
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
  canCancel: Boolean(
    (hasGithubIdentity(user)
      || (row.triggeredBy as { userId?: string | null } | null)?.userId === user.id)
    && row.status !== "completed"
    && row.workflowRunId
    && ((row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true),
  ),
  canRerun: hasGithubIdentity(user),
  cancelable: (row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true,
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

const resolveWorkflowSha = async (
  octokit: ReturnType<typeof createOctokitInstance>,
  owner: string,
  repo: string,
  workflowRef: string,
) => {
  if (/^[a-f0-9]{40}$/i.test(workflowRef)) return workflowRef;

  try {
    const branchResponse = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: workflowRef,
    });
    return branchResponse.data.commit.sha;
  } catch {}

  try {
    const headRefResponse = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${workflowRef}`,
    });
    return headRefResponse.data.object.sha;
  } catch {}

  const tagRefResponse = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `tags/${workflowRef}`,
  });
  return tagRefResponse.data.object.sha;
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
      data: toSummary(syncedRow, user),
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
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

    const body = (await request.json()) as { intent?: "cancel" | "rerun" };
    if (body.intent !== "cancel" && body.intent !== "rerun") {
      throw createHttpError("Invalid action intent.", 400);
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

    const { token } = await getToken(user, params.owner, params.repo, true);
    const octokit = createOctokitInstance(token);
    const isGithubUser = hasGithubIdentity(user);
    const isOwnRun = (row.triggeredBy as { userId?: string | null } | null)?.userId === user.id;
    const isCancelable = ((row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true);

    if (body.intent === "cancel") {
      if (!isCancelable) {
        throw createHttpError("This action cannot be cancelled.", 403);
      }
      if (!isGithubUser && !isOwnRun) {
        throw createHttpError("You can only cancel your own action runs.", 403);
      }
      if (!row.workflowRunId) {
        throw createHttpError("This action run cannot be cancelled yet.", 409);
      }

      await octokit.rest.actions.cancelWorkflowRun({
        owner: row.owner,
        repo: row.repo,
        run_id: row.workflowRunId,
      });

      const [updated] = await db.update(actionRunTable).set({
        status: "completed",
        conclusion: "cancelled",
        updatedAt: new Date(),
        completedAt: new Date(),
      }).where(eq(actionRunTable.id, row.id)).returning();

      return Response.json({
        status: "success",
        message: "Action run cancelled successfully.",
        data: updated ? toSummary(updated, user) : toSummary(row, user),
      });
    }

    if (!isGithubUser) {
      throw createHttpError("Only GitHub users can run this action again.", 403);
    }

    const originalPayload = row.payload as {
      action?: { name?: string; label?: string; cancelable?: boolean };
      repository?: { ref?: string; workflowRef?: string };
      context?: { type?: string; name?: string | null; path?: string | null; data?: Record<string, unknown> };
      inputs?: Record<string, string | number | boolean>;
    } | null;

    const workflowRef = resolveActionRef(originalPayload?.repository?.workflowRef ?? row.workflowRef, params.branch);
    const sha = await resolveWorkflowSha(octokit, params.owner, params.repo, workflowRef);
    const timestamp = new Date();
    const payload = {
      source: "pages-cms",
      action: {
        name: originalPayload?.action?.name ?? row.actionName,
        label: originalPayload?.action?.label ?? row.actionName,
        cancelable: originalPayload?.action?.cancelable ?? true,
      },
      repository: {
        owner: params.owner,
        repo: params.repo,
        ref: originalPayload?.repository?.ref ?? row.ref,
        workflowRef,
        sha,
      },
      triggeredAt: timestamp.toISOString(),
      triggerType: "rerun",
      rerunOfActionRunId: row.id,
      triggeredBy: {
        userId: user.id,
        name: user.name,
        email: user.email,
        githubUsername: user.githubUsername ?? null,
        image: user.image ?? null,
      },
      context: {
        type: originalPayload?.context?.type ?? row.contextType,
        name: originalPayload?.context?.name ?? row.contextName,
        path: originalPayload?.context?.path ?? row.contextPath,
        data: originalPayload?.context?.data ?? {},
      },
      inputs: originalPayload?.inputs ?? {},
    };

    const [createdRun] = await db.insert(actionRunTable).values({
      owner: params.owner,
      repo: params.repo,
      ref: payload.repository.ref,
      workflowRef,
      sha,
      actionName: payload.action.name,
      contextType: payload.context.type,
      contextName: payload.context.name,
      contextPath: payload.context.path,
      workflow: row.workflow,
      status: "dispatching",
      triggeredBy: payload.triggeredBy,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning();

    await octokit.rest.actions.createWorkflowDispatch({
      owner: params.owner,
      repo: params.repo,
      workflow_id: row.workflow,
      ref: workflowRef,
      inputs: {
        payload: JSON.stringify(payload),
      },
    });

    const workflowRun = await findWorkflowRun(
      octokit,
      createdRun,
      await getClaimedWorkflowRunIds(createdRun),
    );

    if (workflowRun) {
      await db.update(actionRunTable).set({
        workflowRunId: workflowRun.id,
        status: workflowRun.status ?? "queued",
        conclusion: workflowRun.conclusion,
        htmlUrl: workflowRun.html_url,
        updatedAt: new Date(),
        completedAt: workflowRun.status === "completed" ? new Date(workflowRun.updated_at) : null,
      }).where(eq(actionRunTable.id, createdRun.id));
    } else {
      await db.update(actionRunTable).set({
        status: "queued",
        updatedAt: new Date(),
      }).where(eq(actionRunTable.id, createdRun.id));
    }

    return Response.json({
      status: "success",
      message: "Action run started successfully.",
      data: {
        id: createdRun.id,
      },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
