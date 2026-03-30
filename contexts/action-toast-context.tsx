"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { requireApiSuccess } from "@/lib/api-client";
import { buttonVariants } from "@/components/ui/button";
import {
  formatActionRunState,
  isActionRunActive,
  type ActionRunSummary,
} from "@/lib/repo-actions";

type TrackedActionToast = {
  runId: number;
  owner: string;
  repo: string;
  refName: string;
  actionLabel: string;
  toastId: string | number;
  state: string | null;
  trackedAt: number;
};

type TrackActionRunInput = Omit<TrackedActionToast, "state" | "trackedAt">;

type ActionToastContextValue = {
  trackActionRun: (input: TrackActionRunInput) => void;
};

const STORAGE_KEY = "pages-cms-action-toasts";
const TRACKING_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const ActionToastContext = createContext<ActionToastContextValue | undefined>(undefined);

const getToastMessage = (actionLabel: string, run?: ActionRunSummary | null) => {
  if (!run) return `Starting "${actionLabel}"…`;

  if (run.status !== "completed") {
    const state = formatActionRunState(run);
    if (state === "Queued") return `Waiting for GitHub to start "${actionLabel}"…`;
    return `"${actionLabel}" is running.`;
  }

  switch (run.conclusion) {
    case "success":
      return `"${actionLabel}" succeeded.`;
    case "failure":
      return `"${actionLabel}" failed.`;
    case "cancelled":
      return `"${actionLabel}" was cancelled.`;
    case "timed_out":
      return `"${actionLabel}" timed out.`;
    case "skipped":
      return `"${actionLabel}" was skipped.`;
    default:
      return `"${actionLabel}" completed.`;
  }
};

export function ActionToastProvider({ children }: { children: React.ReactNode }) {
  const [trackedRuns, setTrackedRuns] = useState<Record<number, TrackedActionToast>>({});
  const refreshErrorToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as Array<Omit<TrackedActionToast, "toastId" | "state">>;
      const nextTrackedRuns = parsed.reduce<Record<number, TrackedActionToast>>((accumulator, item) => {
        if (Date.now() - item.trackedAt > TRACKING_TIMEOUT_MS) {
          return accumulator;
        }
        accumulator[item.runId] = {
          ...item,
          toastId: toast.loading(getToastMessage(item.actionLabel)),
          state: null,
        };
        return accumulator;
      }, {});
      setTrackedRuns(nextTrackedRuns);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const serializable = Object.values(trackedRuns).map(({ runId, owner, repo, refName, actionLabel, trackedAt }) => ({
      runId,
      owner,
      repo,
      refName,
      actionLabel,
      trackedAt,
    }));

    if (serializable.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  }, [trackedRuns]);

  useEffect(() => {
    if (Object.keys(trackedRuns).length === 0) return;

    const cancelTrackedRun = async (trackedRun: TrackedActionToast) => {
      try {
        const response = await fetch(
          `/api/${trackedRun.owner}/${trackedRun.repo}/${encodeURIComponent(trackedRun.refName)}/actions/${trackedRun.runId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intent: "cancel" }),
          },
        );
        await requireApiSuccess(response, "Failed to cancel action run");
        toast.success("Run cancelled.", { id: trackedRun.toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to cancel action run.", { id: trackedRun.toastId });
      }
    };

    const syncTrackedRuns = async () => {
      const entries = Object.values(trackedRuns);
      const expiredEntries = entries.filter((trackedRun) => Date.now() - trackedRun.trackedAt > TRACKING_TIMEOUT_MS);

      if (expiredEntries.length > 0) {
        expiredEntries.forEach((trackedRun) => {
          toast.error(`Stopped tracking "${trackedRun.actionLabel}" after 12 hours.`, {
            id: trackedRun.toastId,
            action: undefined,
            classNames: undefined,
          });
        });

        setTrackedRuns((current) => {
          const next = { ...current };
          expiredEntries.forEach((trackedRun) => {
            delete next[trackedRun.runId];
          });
          return next;
        });

        return;
      }

      const results = await Promise.all(entries.map(async (trackedRun) => {
        const response = await fetch(
          `/api/${trackedRun.owner}/${trackedRun.repo}/${encodeURIComponent(trackedRun.refName)}/actions/${trackedRun.runId}`,
        );
        const payload = await requireApiSuccess<{ data: ActionRunSummary }>(
          response,
          "Failed to fetch action run",
        );
        return { trackedRun, run: payload.data };
      }));

      if (refreshErrorToastIdRef.current != null) {
        toast.dismiss(refreshErrorToastIdRef.current);
        refreshErrorToastIdRef.current = null;
      }

      const completedIds: number[] = [];
      const nextStateUpdates: Array<{ runId: number; state: string }> = [];

      results.forEach(({ trackedRun, run }) => {
        const nextToastState = `${run.status}:${run.conclusion ?? ""}:${run.workflowRunId ?? ""}`;
        if (trackedRun.state === nextToastState) return;

        nextStateUpdates.push({ runId: trackedRun.runId, state: nextToastState });

        if (isActionRunActive(run)) {
          toast.loading(getToastMessage(trackedRun.actionLabel, run), {
            id: trackedRun.toastId,
            action: run.canCancel ? {
              label: "Cancel",
              onClick: () => {
                void cancelTrackedRun(trackedRun);
              },
            } : undefined,
            classNames: run.canCancel ? {
              actionButton: buttonVariants({ variant: "outline", size: "sm" }),
            } : undefined,
          });
          return;
        }

        if (run.conclusion === "success") {
          toast.success(getToastMessage(trackedRun.actionLabel, run), {
            id: trackedRun.toastId,
            action: undefined,
            classNames: undefined,
          });
        } else {
          toast.error(getToastMessage(trackedRun.actionLabel, run), {
            id: trackedRun.toastId,
            action: undefined,
            classNames: undefined,
          });
        }

        completedIds.push(trackedRun.runId);
      });

      if (nextStateUpdates.length === 0 && completedIds.length === 0) return;

      setTrackedRuns((current) => {
        const next = { ...current };

        nextStateUpdates.forEach(({ runId, state }) => {
          if (next[runId]) {
            next[runId] = { ...next[runId], state };
          }
        });

        completedIds.forEach((runId) => {
          delete next[runId];
        });

        return next;
      });
    };

    void syncTrackedRuns();

    const interval = window.setInterval(() => {
      void syncTrackedRuns();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [trackedRuns]);

  const trackActionRun = useCallback((input: TrackActionRunInput) => {
    setTrackedRuns((current) => ({
      ...current,
      [input.runId]: {
        ...input,
        state: null,
        trackedAt: Date.now(),
      },
    }));
  }, []);

  const value = useMemo<ActionToastContextValue>(() => ({
    trackActionRun,
  }), [trackActionRun]);

  return (
    <ActionToastContext.Provider value={value}>
      {children}
    </ActionToastContext.Provider>
  );
}

export const useActionToasts = () => {
  const context = useContext(ActionToastContext);
  if (!context) {
    throw new Error("useActionToasts must be used within an ActionToastProvider");
  }
  return context;
};
