import { db } from "@/db";
import { actionRunTable } from "@/db/schema";
import { eq } from "drizzle-orm";

const handleActionWebhookEvent = async (event: string | null, data: any) => {
  if (event !== "workflow_run") return false;

  const workflowRunId = data.workflow_run?.id;
  if (!workflowRunId) return true;

  await db.update(actionRunTable).set({
    status: data.workflow_run?.status ?? "completed",
    conclusion: data.workflow_run?.conclusion ?? null,
    htmlUrl: data.workflow_run?.html_url ?? null,
    updatedAt: new Date(),
    completedAt: data.workflow_run?.status === "completed"
      ? new Date(data.workflow_run?.updated_at ?? new Date().toISOString())
      : null,
  }).where(eq(actionRunTable.workflowRunId, workflowRunId));

  return true;
};

export { handleActionWebhookEvent };
