export type RepoActionField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "number";
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<{
    label: string;
    value: string;
  }>;
};

export type RepoActionConfig = {
  name: string;
  label: string;
  workflow: string;
  ref?: string;
  cancelable?: boolean;
  scope?: "collection" | "entry";
  confirm?: boolean | {
    title?: string;
    message?: string;
    button?: string;
  };
  fields?: RepoActionField[];
};

export type ActionRunSummary = {
  id: number;
  actionName: string;
  contextType: string | null;
  contextName: string | null;
  contextPath: string | null;
  workflowRef: string | null;
  sha: string | null;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string | null;
  workflowRunId: number | null;
  triggeredByName: string | null;
  triggeredByEmail?: string | null;
  triggeredByGithubUsername?: string | null;
  triggeredByImage?: string | null;
  canCancel?: boolean;
  canRerun?: boolean;
  cancelable?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export const resolveActionRef = (
  ref: string | undefined,
  currentRef: string,
) => (!ref || ref === "current" ? currentRef : ref);

export const getRootActions = (configObject: any): RepoActionConfig[] => {
  return Array.isArray(configObject?.actions) ? configObject.actions : [];
};

export const getSchemaActions = (
  schema: any,
  scope?: "collection" | "entry",
): RepoActionConfig[] => {
  const actions: RepoActionConfig[] = Array.isArray(schema?.actions) ? schema.actions : [];
  if (scope == null) {
    return actions.filter((action) => action.scope == null);
  }
  return actions.filter((action) => action.scope === scope);
};

export const isActionRunActive = (run: ActionRunSummary | null | undefined) => {
  if (!run) return false;
  return run.status !== "completed";
};

export const formatActionRunState = (run: Pick<ActionRunSummary, "status" | "conclusion">) => {
  if (run.status !== "completed") {
    if (run.status === "queued" || run.status === "requested" || run.status === "waiting" || run.status === "dispatching") {
      return "Queued";
    }
    return "Running";
  }

  switch (run.conclusion) {
    case "success":
      return "Succeeded";
    case "failure":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "timed_out":
      return "Timed out";
    case "skipped":
      return "Skipped";
    default:
      return "Completed";
  }
};
