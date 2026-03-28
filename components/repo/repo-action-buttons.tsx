"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleCheck,
  CircleX,
  EllipsisVertical,
  Loader,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requireApiSuccess } from "@/lib/api-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatActionRunState,
  isActionRunActive,
  type ActionRunSummary,
  type RepoActionConfig,
} from "@/lib/repo-actions";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ButtonGroup } from "@/components/ui/button-group";

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

const getRunIcon = (run: ActionRunSummary | null | undefined) => {
  if (!run || isActionRunActive(run)) {
    return <Loader className="size-4 animate-spin" />;
  }
  if (run.conclusion === "success") {
    return <CircleCheck className="size-4 text-green-600 dark:text-green-400" />;
  }
  return <CircleX className="size-4 text-destructive" />;
};

const getPrimaryIcon = (isBusy: boolean) => (
  isBusy ? <Loader className="size-4 animate-spin" /> : <Play className="size-4" />
);

const formatRunLine = (run: ActionRunSummary) => {
  const createdAt = run.createdAt ? new Date(run.createdAt) : null;
  const elapsedMs = createdAt ? Date.now() - createdAt.getTime() : null;
  if (elapsedMs == null) {
    return run.triggeredByName ? `Unknown time by ${run.triggeredByName}` : "Unknown time";
  }

  const minutes = Math.max(0, Math.round(elapsedMs / 60000));
  const relative = minutes < 1
    ? "just now"
    : minutes === 1
      ? "1 min ago"
      : `${minutes} min ago`;

  return run.triggeredByName ? `${relative} by ${run.triggeredByName}` : relative;
};

const getToastMessage = (actionLabel: string, run?: ActionRunSummary | null) => {
  if (!run) return `Queued "${actionLabel}" on GitHub…`;
  const state = formatActionRunState(run);
  if (run.status !== "completed") {
    return `"${actionLabel}" ${state.toLowerCase()} on GitHub…`;
  }
  return `"${actionLabel}" ${state.toLowerCase()}.`;
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
  const [runsByAction, setRunsByAction] = useState<Record<string, ActionRunSummary[]>>({});
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const trackedToastsRef = useRef<Record<number, {
    actionLabel: string;
    toastId: string | number;
    state: string | null;
  }>>({});

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
    const payload = await requireApiSuccess<{ data: Record<string, ActionRunSummary[]> }>(
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

        const runsById = Object.values(latestRuns)
          .flat()
          .reduce<Record<number, ActionRunSummary>>((accumulator, run) => {
            accumulator[run.id] = run;
            return accumulator;
          }, {});

        Object.entries(trackedToastsRef.current).forEach(([runIdKey, trackedToast]) => {
          const runId = Number(runIdKey);
          const run = runsById[runId];
          if (!run) return;

          const nextToastState = `${run.status}:${run.conclusion ?? ""}:${run.workflowRunId ?? ""}`;
          if (trackedToast.state === nextToastState) return;
          trackedToast.state = nextToastState;

          if (isActionRunActive(run)) {
            toast.loading(getToastMessage(trackedToast.actionLabel, run), { id: trackedToast.toastId });
            return;
          }

          if (run.conclusion === "success") {
            toast.success(getToastMessage(trackedToast.actionLabel, run), { id: trackedToast.toastId });
          } else {
            toast.error(getToastMessage(trackedToast.actionLabel, run), { id: trackedToast.toastId });
          }

          delete trackedToastsRef.current[runId];
        });
      } catch (error) {
        console.error(error);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [actions, loadRuns]);

  const handleDispatch = useCallback(async (action: RepoActionConfig) => {
    const toastId = toast.loading(`Queueing "${action.label}"…`);

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
      const payload = await requireApiSuccess<{ data: { id: number } }>(
        response,
        "Failed to dispatch action",
      );
      trackedToastsRef.current[payload.data.id] = {
        actionLabel: action.label,
        toastId,
        state: null,
      };
      const latestRuns = await loadRuns();
      const run = latestRuns?.[action.name]?.find((item) => item.id === payload.data.id);
      if (run) {
        trackedToastsRef.current[payload.data.id].state = `${run.status}:${run.conclusion ?? ""}:${run.workflowRunId ?? ""}`;
        toast.loading(getToastMessage(action.label, run), { id: toastId });
      } else {
        toast.loading(`Queueing "${action.label}"…`, { id: toastId });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to dispatch action.", { id: toastId });
    } finally {
      setDispatching((current) => ({ ...current, [action.name]: false }));
    }
  }, [contextData, contextName, contextPath, contextType, loadRuns, owner, refName, repo]);

  const renderRunHistory = (action: RepoActionConfig, runs: ActionRunSummary[]) => {
    if (runs.length === 0) return null;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {layout === "sidebar"
            ? (
              <SidebarMenuAction showOnHover>
                <EllipsisVertical />
              </SidebarMenuAction>
            )
            : (
              <Button type="button" variant="outline" size="icon-sm">
                <EllipsisVertical />
              </Button>
            )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-64">
          {runs.map((run) => (
            <DropdownMenuItem
              key={run.id}
              asChild={Boolean(run.htmlUrl)}
              disabled={!run.htmlUrl}
            >
              {run.htmlUrl ? (
                <Link
                  href={run.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3"
                >
                  {getRunIcon(run)}
                  <span className="truncate">{formatRunLine(run)}</span>
                </Link>
              ) : (
                <div className="flex w-full items-center gap-3">
                  {getRunIcon(run)}
                  <span className="truncate">{formatRunLine(run)}</span>
                </div>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (actions.length === 0) return null;

  if (layout === "sidebar") {
    return (
      <SidebarMenu>
        {actions.map((action) => {
          const runs = runsByAction[action.name] || [];
          const latestRun = runs[0];
          const isBusy = dispatching[action.name];

          return (
            <SidebarMenuItem key={action.name}>
              <SidebarMenuButton
                onClick={() => void handleDispatch(action)}
                disabled={isBusy}
                isActive={isBusy}
                className="pr-8"
              >
                {getPrimaryIcon(isBusy)}
                <span>{action.label}</span>
              </SidebarMenuButton>
              {renderRunHistory(action, runs)}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        const runs = runsByAction[action.name] || [];
        const isBusy = dispatching[action.name];

        return (
          <ButtonGroup key={action.name}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => void handleDispatch(action)}
              className="gap-2"
            >
              {getPrimaryIcon(isBusy)}
              <span>{action.label}</span>
            </Button>
            {renderRunHistory(action, runs)}
          </ButtonGroup>
        );
      })}
    </div>
  );
}
