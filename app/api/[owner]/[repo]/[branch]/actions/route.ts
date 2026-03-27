import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { actionRunTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { resolveActionRef } from "@/lib/repo-actions";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const findWorkflowRun = async (
  octokit: ReturnType<typeof createOctokitInstance>,
  owner: string,
  repo: string,
  workflow: string,
  workflowRef: string,
  startedAt: string,
) => {
  const startedAtMs = Date.parse(startedAt);

  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflow,
      branch: workflowRef,
      event: "workflow_dispatch",
      per_page: 10,
    });

    const run = response.data.workflow_runs
      .filter((item) => Date.parse(item.created_at) >= startedAtMs - 30_000)
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];

    if (run) return run;
    await sleep(1500);
  }

  return null;
};

const buildContextWhere = ({
  owner,
  repo,
  ref,
  actionNames,
  contextType,
  contextName,
  contextPath,
}: {
  owner: string;
  repo: string;
  ref: string;
  actionNames: string[];
  contextType: string;
  contextName: string | null;
  contextPath: string | null;
}) => and(
  eq(actionRunTable.owner, owner),
  eq(actionRunTable.repo, repo),
  eq(actionRunTable.ref, ref),
  inArray(actionRunTable.actionName, actionNames),
  eq(actionRunTable.contextType, contextType),
  contextName == null ? isNull(actionRunTable.contextName) : eq(actionRunTable.contextName, contextName),
  contextPath == null ? isNull(actionRunTable.contextPath) : eq(actionRunTable.contextPath, contextPath),
);

const syncActionRun = async (
  octokit: ReturnType<typeof createOctokitInstance>,
  row: typeof actionRunTable.$inferSelect,
) => {
  if (!row.workflowRunId) {
    const workflowRun = await findWorkflowRun(
      octokit,
      row.owner,
      row.repo,
      row.workflow,
      row.workflowRef,
      row.createdAt.toISOString(),
    );

    if (!workflowRun) return row;

    const [updated] = await db.update(actionRunTable).set({
      workflowRunId: workflowRun.id,
      status: workflowRun.status ?? "queued",
      conclusion: workflowRun.conclusion,
      htmlUrl: workflowRun.html_url,
      updatedAt: new Date(),
      completedAt: workflowRun.status === "completed" ? new Date(workflowRun.updated_at) : null,
    }).where(eq(actionRunTable.id, row.id)).returning();

    return updated ?? row;
  }

  if (row.status === "completed") {
    return row;
  }

  const workflowRunResponse = await octokit.rest.actions.getWorkflowRun({
    owner: row.owner,
    repo: row.repo,
    run_id: row.workflowRunId,
  });

  let failure = row.failure as any;
  if (
    workflowRunResponse.data.status === "completed"
    && workflowRunResponse.data.conclusion
    && workflowRunResponse.data.conclusion !== "success"
  ) {
    const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
      owner: row.owner,
      repo: row.repo,
      run_id: row.workflowRunId,
      per_page: 100,
    });
    const failedJob = jobsResponse.data.jobs.find((job) => job.conclusion === "failure")
      || jobsResponse.data.jobs.find((job) => job.conclusion && job.conclusion !== "success");
    if (failedJob) {
      const failedStep = failedJob.steps?.find((step) => step.conclusion === "failure")
        || failedJob.steps?.find((step) => step.conclusion && step.conclusion !== "success");
      failure = {
        jobName: failedJob.name,
        stepName: failedStep?.name ?? null,
      };
    }
  }

  const [updated] = await db.update(actionRunTable).set({
    status: workflowRunResponse.data.status ?? row.status,
    conclusion: workflowRunResponse.data.conclusion,
    htmlUrl: workflowRunResponse.data.html_url,
    failure,
    updatedAt: new Date(),
    completedAt: workflowRunResponse.data.status === "completed"
      ? new Date(workflowRunResponse.data.updated_at)
      : null,
  }).where(eq(actionRunTable.id, row.id)).returning();

  return updated ?? row;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;
    const { token } = await getToken(user, params.owner, params.repo, true);
    const octokit = createOctokitInstance(token);

    const url = new URL(request.url);
    const actionNames = (url.searchParams.get("actionNames") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const contextType = url.searchParams.get("contextType") || "";
    const contextName = url.searchParams.get("contextName");
    const contextPath = url.searchParams.get("contextPath");

    if (actionNames.length === 0 || !contextType) {
      throw createHttpError("actionNames and contextType are required.", 400);
    }

    const rows = await db.select().from(actionRunTable)
      .where(buildContextWhere({
        owner: params.owner,
        repo: params.repo,
        ref: params.branch,
        actionNames,
        contextType,
        contextName,
        contextPath,
      }))
      .orderBy(desc(actionRunTable.createdAt));

    const latestByAction = new Map<string, typeof rows[number]>();
    rows.forEach((row) => {
      if (!latestByAction.has(row.actionName)) {
        latestByAction.set(row.actionName, row);
      }
    });

    await Promise.all(
      Array.from(latestByAction.entries()).map(async ([actionName, row]) => {
        const syncedRow = await syncActionRun(octokit, row);
        latestByAction.set(actionName, syncedRow);
      }),
    );

    return Response.json({
      status: "success",
      message: "Action runs fetched successfully.",
      data: actionNames.reduce<Record<string, any>>((accumulator, actionName) => {
        const row = latestByAction.get(actionName);
        accumulator[actionName] = row
          ? {
              id: row.id,
              actionName: row.actionName,
              status: row.status,
              conclusion: row.conclusion,
              htmlUrl: row.htmlUrl,
              workflowRunId: row.workflowRunId,
              createdAt: row.createdAt?.toISOString() ?? null,
              updatedAt: row.updatedAt?.toISOString() ?? null,
              completedAt: row.completedAt?.toISOString() ?? null,
              failure: row.failure as any,
            }
          : null;
        return accumulator;
      }, {}),
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo, true);
    const octokit = createOctokitInstance(token);

    const body = (await request.json()) as {
      action?: { name?: string; label?: string; workflow?: string; ref?: string };
      context?: {
        kind?: string;
        name?: string | null;
        path?: string | null;
        data?: Record<string, unknown>;
      };
    };

    const action = body.action;
    const actionContext = body.context;
    if (!action?.name || !action?.label || !action?.workflow) {
      throw createHttpError("Action name, label, and workflow are required.", 400);
    }
    if (!actionContext?.kind) {
      throw createHttpError("Action context kind is required.", 400);
    }

    const workflowRef = resolveActionRef(action.ref, params.branch);
    const sha = await resolveWorkflowSha(octokit, params.owner, params.repo, workflowRef);
    const timestamp = new Date();
    const payload = {
      source: "pages-cms",
      action: {
        name: action.name,
        label: action.label,
      },
      repository: {
        owner: params.owner,
        repo: params.repo,
        ref: params.branch,
        workflowRef,
        sha,
      },
      triggeredAt: timestamp.toISOString(),
      triggeredBy: {
        userId: user.id,
        name: user.name,
        email: user.email,
        githubUsername: user.githubUsername ?? null,
      },
      context: {
        type: actionContext.kind,
        name: actionContext.name ?? null,
        path: actionContext.path ?? null,
        data: actionContext.data ?? {},
      },
    };

    const [createdRun] = await db.insert(actionRunTable).values({
      owner: params.owner,
      repo: params.repo,
      ref: params.branch,
      workflowRef,
      sha,
      actionName: action.name,
      contextType: actionContext.kind,
      contextName: actionContext.name ?? null,
      contextPath: actionContext.path ?? null,
      workflow: action.workflow,
      status: "dispatching",
      triggeredBy: payload.triggeredBy,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning();

    await octokit.rest.actions.createWorkflowDispatch({
      owner: params.owner,
      repo: params.repo,
      workflow_id: action.workflow,
      ref: workflowRef,
      inputs: {
        payload: JSON.stringify(payload),
      },
    });

    const workflowRun = await findWorkflowRun(
      octokit,
      params.owner,
      params.repo,
      action.workflow,
      workflowRef,
      timestamp.toISOString(),
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
      message: `Action "${action.label}" dispatched successfully.`,
      data: {
        id: createdRun.id,
      },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
