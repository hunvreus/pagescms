"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CircleCheck,
  CirclePlay,
  CircleX,
  EllipsisVertical,
  Loader,
} from "lucide-react";
import { toast } from "sonner";
import { useActionToasts } from "@/contexts/action-toast-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { requireApiSuccess } from "@/lib/api-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatActionRunState,
  isActionRunActive,
  type RepoActionField,
  type ActionRunSummary,
  type RepoActionConfig,
} from "@/lib/actions";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  isBusy ? <Loader className="size-4 animate-spin" /> : <CirclePlay className="size-4" />
);

const formatRunLine = (run: ActionRunSummary) => {
  const createdAt = run.createdAt ? new Date(run.createdAt) : null;
  const secondary = run.triggeredByName ? `by ${run.triggeredByName}` : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">Unknown time</span>
        {secondary && (
          <span className="truncate text-xs text-muted-foreground">{secondary}</span>
        )}
      </span>
    );
  }

  const relative = formatDistanceToNowStrict(createdAt, { addSuffix: true });

  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{relative}</span>
      {secondary && (
        <span className="truncate text-xs text-muted-foreground">{secondary}</span>
      )}
    </span>
  );
};

const getDefaultFieldValues = (fields: RepoActionField[] | undefined) => {
  return (fields ?? []).reduce<Record<string, string | number | boolean>>((accumulator, field) => {
    if (field.default != null) {
      accumulator[field.name] = field.default;
      return accumulator;
    }
    accumulator[field.name] = field.type === "checkbox" ? false : "";
    return accumulator;
  }, {});
};

const isFieldValueValid = (field: RepoActionField, value: string | number | boolean | undefined) => {
  if (!field.required) return true;
  if (field.type === "checkbox") return value === true;
  if (field.type === "number") return value !== "" && value != null;
  return typeof value === "string" && value.trim().length > 0;
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
  const { user } = useUser();
  const { trackActionRun } = useActionToasts();
  const isGithubUser = hasGithubIdentity(user);
  const [runsByAction, setRunsByAction] = useState<Record<string, ActionRunSummary[]>>({});
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const [dialogAction, setDialogAction] = useState<RepoActionConfig | null>(null);
  const [dialogValues, setDialogValues] = useState<Record<string, string | number | boolean>>({});
  const refreshErrorToastIdRef = useRef<string | number | null>(null);

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
        if (refreshErrorToastIdRef.current != null) {
          toast.dismiss(refreshErrorToastIdRef.current);
          refreshErrorToastIdRef.current = null;
        }

      } catch (error) {
        console.error(error);
        if (refreshErrorToastIdRef.current == null) {
          refreshErrorToastIdRef.current = toast.error("Couldn’t refresh action status. Retrying…");
        }
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [actions, loadRuns]);

  const dispatchAction = useCallback(async (
    action: RepoActionConfig,
    inputValues: Record<string, string | number | boolean> = {},
  ) => {
    const toastId = toast.loading(`Starting "${action.label}"…`);

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
          inputs: inputValues,
        }),
      });
      const payload = await requireApiSuccess<{ data: { id: number } }>(
        response,
        "Failed to dispatch action",
      );
      trackActionRun({
        runId: payload.data.id,
        owner,
        repo,
        refName,
        actionLabel: action.label,
        toastId,
      });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to dispatch action.", { id: toastId });
      } finally {
        setDispatching((current) => ({ ...current, [action.name]: false }));
      }
  }, [contextData, contextName, contextPath, contextType, owner, refName, repo, trackActionRun]);

  const handleActionClick = useCallback((action: RepoActionConfig) => {
    const shouldConfirm = action.confirm !== false;
    const hasFields = Boolean(action.fields?.length);
    if (!shouldConfirm && !hasFields) {
      void dispatchAction(action);
      return;
    }

    setDialogAction(action);
    setDialogValues(getDefaultFieldValues(action.fields));
  }, [dispatchAction]);

  const isDialogSubmitDisabled = useMemo(() => {
    if (!dialogAction?.fields?.length) return false;
    return dialogAction.fields.some((field) => !isFieldValueValid(field, dialogValues[field.name]));
  }, [dialogAction, dialogValues]);

  const handleDialogSubmit = useCallback(() => {
    if (!dialogAction) return;
    void dispatchAction(dialogAction, dialogValues);
    setDialogAction(null);
    setDialogValues({});
  }, [dialogAction, dialogValues, dispatchAction]);

  const renderDialogField = (field: RepoActionField) => {
    const value = dialogValues[field.name];
    const fieldId = `action-field-${field.name}`;

    if (field.type === "textarea") {
      return (
        <Textarea
          id={fieldId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setDialogValues((current) => ({ ...current, [field.name]: event.target.value }))}
        />
      );
    }

    if (field.type === "select") {
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(nextValue) => setDialogValues((current) => ({ ...current, [field.name]: nextValue }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={field.label} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === "checkbox") {
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={fieldId}
            checked={value === true}
            onCheckedChange={(checked) =>
              setDialogValues((current) => ({
                ...current,
                [field.name]: checked === true,
              }))
            }
          />
          <Label htmlFor={fieldId}>{field.label}</Label>
        </div>
      );
    }

    return (
      <Input
        id={fieldId}
        type={field.type === "number" ? "number" : "text"}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(event) => setDialogValues((current) => ({
          ...current,
          [field.name]: field.type === "number"
            ? (Number.isNaN(event.target.valueAsNumber) ? "" : event.target.valueAsNumber)
            : event.target.value,
        }))}
      />
    );
  };

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
              <Button type="button" variant="outline" size="icon">
                <EllipsisVertical />
              </Button>
            )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-64">
          {runs.map((run) => (
            isGithubUser && run.htmlUrl ? (
              <DropdownMenuItem key={run.id} asChild>
                <Link
                  href={run.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3"
                >
                  {getRunIcon(run)}
                  <span className="min-w-0 flex-1">
                    {formatRunLine(run)}
                  </span>
                </Link>
              </DropdownMenuItem>
            ) : (
              <div
                key={run.id}
                className="flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm"
              >
                {getRunIcon(run)}
                <span className="min-w-0 flex-1">
                  {formatRunLine(run)}
                </span>
              </div>
            )
          ))}
          {isGithubUser && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/${owner}/${repo}/${encodeURIComponent(refName)}/actions`}>
                  View all actions
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const dialogNode = (
    <Dialog open={dialogAction != null} onOpenChange={(open) => {
      if (!open) {
        setDialogAction(null);
        setDialogValues({});
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {typeof dialogAction?.confirm === "object" && dialogAction.confirm.title
              ? dialogAction.confirm.title
              : dialogAction?.label}
          </DialogTitle>
          <DialogDescription>
            {typeof dialogAction?.confirm === "object" && dialogAction.confirm.message
              ? dialogAction.confirm.message
              : "This will trigger a GitHub Action."}
          </DialogDescription>
        </DialogHeader>
        {dialogAction?.fields?.length ? (
          <div className="grid gap-4">
            {dialogAction.fields.map((field) => (
              <div key={field.name} className="grid gap-2">
                {field.type !== "checkbox" && (
                  <label className="text-sm font-medium" htmlFor={`action-field-${field.name}`}>
                    {field.label}
                  </label>
                )}
                {renderDialogField(field)}
              </div>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setDialogAction(null);
            setDialogValues({});
          }}>
            Cancel
          </Button>
          <Button onClick={handleDialogSubmit} disabled={isDialogSubmitDisabled}>
            {typeof dialogAction?.confirm === "object" && dialogAction.confirm.button
              ? dialogAction.confirm.button
              : dialogAction?.label ?? "Run action"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (actions.length === 0) return null;

  if (layout === "sidebar") {
    return (
      <SidebarMenu>
        {actions.map((action) => {
          const runs = runsByAction[action.name] || [];
          const isBusy = dispatching[action.name];

          return (
            <SidebarMenuItem key={action.name}>
              <SidebarMenuButton
                onClick={() => handleActionClick(action)}
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
        {dialogNode}
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
              variant="outline"
              disabled={isBusy}
              onClick={() => handleActionClick(action)}
              className="gap-2"
            >
              {getPrimaryIcon(isBusy)}
              <span>{action.label}</span>
            </Button>
            {renderRunHistory(action, runs)}
          </ButtonGroup>
        );
      })}
      {dialogNode}
    </div>
  );
}
