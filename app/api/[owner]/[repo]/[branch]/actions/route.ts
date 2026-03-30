import { and, desc, eq, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { actionRunTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { resolveActionRef } from "@/lib/repo-actions";
import { hasGithubIdentity } from "@/lib/authz";

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
  claimedRunIds: number[] = [],
) => {
  const startedAtMs = Date.parse(startedAt);
  const claimedRunIdsSet = new Set(claimedRunIds);

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

const getClaimedWorkflowRunIds = async (
  owner: string,
  repo: string,
  workflow: string,
  workflowRef: string,
  excludeRowId?: number,
) => {
  const rows = await db.select({
    workflowRunId: actionRunTable.workflowRunId,
  }).from(actionRunTable).where(and(
    eq(actionRunTable.owner, owner),
    eq(actionRunTable.repo, repo),
    eq(actionRunTable.workflow, workflow),
    eq(actionRunTable.workflowRef, workflowRef),
    isNotNull(actionRunTable.workflowRunId),
    excludeRowId == null ? undefined : ne(actionRunTable.id, excludeRowId),
  ));

  return rows
    .map((row) => row.workflowRunId)
    .filter((value): value is number => typeof value === "number");
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
    const claimedRunIds = await getClaimedWorkflowRunIds(
      row.owner,
      row.repo,
      row.workflow,
      row.workflowRef,
      row.id,
    );
    const workflowRun = await findWorkflowRun(
      octokit,
      row.owner,
      row.repo,
      row.workflow,
      row.workflowRef,
      row.createdAt.toISOString(),
      claimedRunIds,
    );

    if (!workflowRun) return row;

    try {
      const [updated] = await db.update(actionRunTable).set({
        workflowRunId: workflowRun.id,
        status: workflowRun.status ?? "queued",
        conclusion: workflowRun.conclusion,
        htmlUrl: workflowRun.html_url,
        updatedAt: new Date(),
        completedAt: workflowRun.status === "completed" ? new Date(workflowRun.updated_at) : null,
      }).where(eq(actionRunTable.id, row.id)).returning();

      return updated ?? row;
    } catch {
      return row;
    }
  }

  if (row.status === "completed") {
    return row;
  }

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
    const isGithubUser = hasGithubIdentity(user);
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

    const listAll = url.searchParams.get("all") === "1";

    if (!listAll && (actionNames.length === 0 || !contextType)) {
      throw createHttpError("actionNames and contextType are required.", 400);
    }

    const rows = await db.select().from(actionRunTable)
      .where(
        listAll
          ? and(
            eq(actionRunTable.owner, params.owner),
            eq(actionRunTable.repo, params.repo),
            eq(actionRunTable.ref, params.branch),
          )
          : buildContextWhere({
            owner: params.owner,
            repo: params.repo,
            ref: params.branch,
            actionNames,
            contextType,
            contextName,
            contextPath,
          }),
      )
      .orderBy(desc(actionRunTable.createdAt));

    if (listAll) {
      const topRows = rows.slice(0, 100);
      const syncedRows = await Promise.all(topRows.map((row) => syncActionRun(octokit, row)));

      return Response.json({
        status: "success",
        message: "Action runs fetched successfully.",
        data: syncedRows.map((row) => ({
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
          canCancel: Boolean(
            (isGithubUser
              || (row.triggeredBy as { userId?: string | null } | null)?.userId === user.id)
            && row.status !== "completed"
            && row.workflowRunId
            && ((row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true),
          ),
          canRerun: isGithubUser,
          cancelable: (row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true,
        })),
      });
    }

    const topRowsByAction = actionNames.reduce<Record<string, typeof rows>>((accumulator, actionName) => {
      accumulator[actionName] = rows
        .filter((row) => row.actionName === actionName)
        .slice(0, 3);
      return accumulator;
    }, {});

    const syncedTopRowsByAction = Object.fromEntries(
      await Promise.all(
        Object.entries(topRowsByAction).map(async ([actionName, actionRows]) => {
          const syncedRows = await Promise.all(
            actionRows.map((row) => syncActionRun(octokit, row)),
          );
          return [actionName, syncedRows] as const;
        }),
      ),
    ) as Record<string, typeof rows>;

    return Response.json({
      status: "success",
      message: "Action runs fetched successfully.",
      data: actionNames.reduce<Record<string, any[]>>((accumulator, actionName) => {
        accumulator[actionName] = (syncedTopRowsByAction[actionName] || [])
          .map((row) => ({
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
            canCancel: Boolean(
              (isGithubUser
                || (row.triggeredBy as { userId?: string | null } | null)?.userId === user.id)
              && row.status !== "completed"
              && row.workflowRunId
              && ((row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true),
            ),
            canRerun: isGithubUser,
            cancelable: (row.payload as { action?: { cancelable?: boolean } } | null)?.action?.cancelable ?? true,
          }));
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
      action?: { name?: string; label?: string; workflow?: string; ref?: string; cancelable?: boolean };
      context?: {
        kind?: string;
        name?: string | null;
        path?: string | null;
        data?: Record<string, unknown>;
      };
      inputs?: Record<string, string | number | boolean>;
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
        cancelable: action.cancelable !== false,
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
        image: user.image ?? null,
      },
      context: {
        type: actionContext.kind,
        name: actionContext.name ?? null,
        path: actionContext.path ?? null,
        data: actionContext.data ?? {},
      },
      inputs: body.inputs ?? {},
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
      await getClaimedWorkflowRunIds(
        params.owner,
        params.repo,
        action.workflow,
        workflowRef,
        createdRun.id,
      ),
    );

    if (workflowRun) {
      try {
        await db.update(actionRunTable).set({
          workflowRunId: workflowRun.id,
          status: workflowRun.status ?? "queued",
          conclusion: workflowRun.conclusion,
          htmlUrl: workflowRun.html_url,
          updatedAt: new Date(),
          completedAt: workflowRun.status === "completed" ? new Date(workflowRun.updated_at) : null,
        }).where(eq(actionRunTable.id, createdRun.id));
      } catch {
        await db.update(actionRunTable).set({
          status: "queued",
          updatedAt: new Date(),
        }).where(eq(actionRunTable.id, createdRun.id));
      }
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
