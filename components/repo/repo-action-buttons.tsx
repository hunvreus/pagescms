"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireApiSuccess } from "@/lib/api-client";
import {
  formatActionRunState,
  isActionRunActive,
  type ActionRunSummary,
  type RepoActionConfig,
} from "@/lib/repo-actions";

type RepoActionButtonsProps = {
  actions: RepoActionConfig[];
  owner: string;
  repo: string;
  refName: string;
  contextType: string;
  contextName?: string | null;
  contextPath?: string | null;
  contextData?: Record<string, unknown>;
  layout?: "header" | "sidebar";
};

export function RepoActionButtons({
  actions,
  owner,
  repo,
  refName,
  contextType,
  contextName = null,
  contextPath = null,
  contextData = {},
  layout = "header",
}: RepoActionButtonsProps) {
  const [runsByAction, setRunsByAction] = useState<Record<string, ActionRunSummary | null>>({});
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const toastIdsRef = useRef<Record<string, string | number>>({});

  const actionNames = useMemo(() => actions.map((action) => action.name), [actions]);

  const loadRuns = useCallback(async () => {
    if (actions.length === 0) return;

    const params = new URLSearchParams({
      actionNames: actionNames.join(","),
      contextType,
    });
    if (contextName) params.set("contextName", contextName);
    if (contextPath) params.set("contextPath", contextPath);

    const response = await fetch(`/api/${owner}/${repo}/${encodeURIComponent(refName)}/actions?${params.toString()}`);
    const payload = await requireApiSuccess<{ data: Record<string, ActionRunSummary | null> }>(
      response,
      "Failed to fetch action runs",
    );
    setRunsByAction(payload.data);
    return payload.data;
  }, [actionNames, actions.length, contextName, contextPath, contextType, owner, refName, repo]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (actions.length === 0) return;

    const interval = window.setInterval(async () => {
      try {
        const latestRuns = await loadRuns();
        if (!latestRuns) return;

        actions.forEach((action) => {
          const run = latestRuns[action.name];
          const toastId = toastIdsRef.current[action.name];
          if (!toastId || !run) return;

          if (isActionRunActive(run)) {
            toast.loading(`"${action.label}" ${formatActionRunState(run).toLowerCase()}...`, { id: toastId });
            return;
          }

          if (run.conclusion === "success") {
            toast.success(`"${action.label}" succeeded.`, { id: toastId });
          } else {
            const failureDetail = run.failure?.stepName || run.failure?.jobName;
            toast.error(
              failureDetail
                ? `"${action.label}" failed at "${failureDetail}".`
                : `"${action.label}" ${formatActionRunState(run).toLowerCase()}.`,
              { id: toastId },
            );
          }
          delete toastIdsRef.current[action.name];
        });
      } catch (error) {
        console.error(error);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [actions, loadRuns]);

  const handleDispatch = useCallback(async (action: RepoActionConfig) => {
    const toastId = toast.loading(`Starting "${action.label}"...`);
    toastIdsRef.current[action.name] = toastId;

    setDispatching((current) => ({ ...current, [action.name]: true }));

    try {
      const response = await fetch(`/api/${owner}/${repo}/${encodeURIComponent(refName)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          context: {
            kind: contextType,
            name: contextName,
            path: contextPath,
            data: contextData,
          },
        }),
      });
      await requireApiSuccess(response, "Failed to dispatch action");
      const latestRuns = await loadRuns();
      const run = latestRuns?.[action.name];
      if (run) {
        toast.loading(`"${action.label}" ${formatActionRunState(run).toLowerCase()}...`, { id: toastId });
      } else {
        toast.success(`"${action.label}" dispatched.`, { id: toastId });
        delete toastIdsRef.current[action.name];
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to dispatch action.", { id: toastId });
      delete toastIdsRef.current[action.name];
    } finally {
      setDispatching((current) => ({ ...current, [action.name]: false }));
    }
  }, [contextData, contextName, contextPath, contextType, loadRuns, owner, refName, repo]);

  if (actions.length === 0) return null;

  return (
    <div className={layout === "sidebar" ? "flex flex-col gap-3" : "flex flex-wrap items-center gap-2"}>
      {actions.map((action) => {
        const run = runsByAction[action.name];
        const isBusy = dispatching[action.name] || isActionRunActive(run);

        return (
          <div
            key={action.name}
            className={layout === "sidebar" ? "flex flex-col items-start gap-2" : "flex items-center gap-2"}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => void handleDispatch(action)}
              className="gap-2"
            >
              {isBusy && <LoaderCircle className="size-4 animate-spin" />}
              <span>{action.label}</span>
            </Button>
            {run && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{formatActionRunState(run)}</Badge>
                {run.htmlUrl && (
                  <a href={run.htmlUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    View run
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
