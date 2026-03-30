"use client";

import Link from "next/link";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowUpRight,
  CircleCheck,
  CircleX,
  EllipsisVertical,
  Funnel,
  Loader,
} from "lucide-react";
import { toast } from "sonner";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { useActionToasts } from "@/contexts/action-toast-context";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { requireApiSuccess } from "@/lib/api-client";
import {
  formatActionRunState,
  isActionRunActive,
  type ActionRunSummary,
} from "@/lib/repo-actions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 25;
const PAGE_BUTTON_COUNT = 5;

const getRunIcon = (run: ActionRunSummary) => {
  if (isActionRunActive(run)) return <Loader className="size-4 animate-spin" />;
  if (run.conclusion === "success")
    return (
      <CircleCheck className="size-4 text-green-600 dark:text-green-400" />
    );
  return <CircleX className="size-4 text-destructive" />;
};

const getStatusLabel = (run: ActionRunSummary) => formatActionRunState(run);

const getStatusFilterValue = (run: ActionRunSummary) => {
  if (isActionRunActive(run)) return "pending";
  if (run.conclusion === "success") return "succeeded";
  return "failed";
};

const formatContext = (
  run: ActionRunSummary,
  contextLabels: Record<string, string>,
) => {
  const contextLabel =
    run.contextType && run.contextName
      ? (contextLabels[`${run.contextType}:${run.contextName}`] ??
        run.contextName)
      : null;

  switch (run.contextType) {
    case "collection":
      return `Collection (${contextLabel ?? "-"})`;
    case "entry":
      return `Entry (${contextLabel ?? "-"})`;
    case "media":
      return `Media (${contextLabel ?? "-"})`;
    case "file":
      return `File (${contextLabel ?? "-"})`;
    default:
      return "Sidebar";
  }
};

const formatDetails = (run: ActionRunSummary) => [
  { label: "Surface", value: run.contextType ?? "-" },
  { label: "Name", value: run.contextName ?? "-" },
  { label: "Path", value: run.contextPath ?? "-" },
];

const getShaUrl = (owner: string, repo: string, sha: string | null) => {
  if (!sha) return null;
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
};

const UnderlinedTrigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(function UnderlinedTrigger({ children, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`group text-left ${className ?? ""}`.trim()}
      {...props}
    >
      <span className="border-b border-dotted border-current/50 transition-colors group-hover:border-current">
        {children}
      </span>
    </button>
  );
});

function DetailValue({ value }: { value: string }) {
  if (value === "-") {
    return <span className="text-muted-foreground">-</span>;
  }

  return <span className="font-mono text-[13px]">{value}</span>;
}

function ActionsPagination({
  pageCount,
  pageIndex,
  paginationItems,
  onPrevious,
  onNext,
  onPageSelect,
}: {
  pageCount: number;
  pageIndex: number;
  paginationItems: Array<number | "ellipsis">;
  onPrevious: () => void;
  onNext: () => void;
  onPageSelect: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <footer className="flex items-center justify-end">
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              iconOnly
              onClick={(event) => {
                event.preventDefault();
                onPrevious();
              }}
              className={
                pageIndex === 0 ? "pointer-events-none opacity-50" : undefined
              }
            />
          </PaginationItem>
          {paginationItems.map((item, index) => (
            <PaginationItem key={`${item}-${index}`}>
              {item === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  isActive={item === pageIndex}
                  onClick={(event) => {
                    event.preventDefault();
                    onPageSelect(item);
                  }}
                >
                  {item + 1}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              iconOnly
              onClick={(event) => {
                event.preventDefault();
                onNext();
              }}
              className={
                pageIndex >= pageCount - 1
                  ? "pointer-events-none opacity-50"
                  : undefined
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </footer>
  );
}

function ActionsTableSkeleton() {
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead>
              <Skeleton className="h-4 w-16 rounded" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-20 rounded" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-16 rounded" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-20 rounded" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-12 rounded" />
            </TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: PAGE_SIZE }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="size-4 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-28 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-32 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-28 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24 rounded" />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="icon-sm" disabled>
                  <EllipsisVertical className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <footer className="flex items-center justify-end">
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            {Array.from({ length: PAGE_BUTTON_COUNT + 2 }).map((_, index) => (
              <PaginationItem key={index}>
                <Skeleton className="size-8 rounded-md" />
              </PaginationItem>
            ))}
          </PaginationContent>
        </Pagination>
      </footer>
    </div>
  );
}

type ActionsPageProps = {
  owner: string;
  repo: string;
  branch: string;
  actionLabels?: Record<string, string>;
  contextLabels?: Record<string, string>;
};

export function ActionsPage({
  owner,
  repo,
  branch,
  actionLabels = {},
  contextLabels = {},
}: ActionsPageProps) {
  const { trackActionRun } = useActionToasts();
  const [runs, setRuns] = useState<ActionRunSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [triggeredByFilter, setTriggeredByFilter] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);

  const loadRuns = useCallback(async () => {
    const response = await fetch(
      `/api/${owner}/${repo}/${encodeURIComponent(branch)}/actions?all=1`,
    );
    const payload = await requireApiSuccess<{ data: ActionRunSummary[] }>(
      response,
      "Failed to fetch action runs",
    );
    setRuns(payload.data);
  }, [branch, owner, repo]);

  const handleRunAction = useCallback(async (
    run: ActionRunSummary,
    intent: "cancel" | "rerun",
  ) => {
    try {
      const response = await fetch(
        `/api/${owner}/${repo}/${encodeURIComponent(branch)}/actions/${run.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent }),
        },
      );
      const payload = await requireApiSuccess<{ data?: ActionRunSummary | { id: number } }>(
        response,
        `Failed to ${intent === "cancel" ? "cancel" : "run"} action`,
      );

      if (intent === "rerun" && payload.data && "id" in payload.data) {
        const actionLabel = actionLabels[run.actionName] ?? run.actionName;
        const toastId = toast.loading(`Starting "${actionLabel}"…`);
        trackActionRun({
          runId: payload.data.id,
          owner,
          repo,
          refName: branch,
          actionLabel,
          toastId,
        });
      } else if (intent === "cancel") {
        toast.success("Run cancelled.");
      }

      await loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    }
  }, [actionLabels, branch, loadRuns, owner, repo, trackActionRun]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void loadRuns();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [loadRuns]);

  const actionOptions = useMemo(
    () => Array.from(new Set((runs ?? []).map((run) => run.actionName))).sort(),
    [runs],
  );
  const triggeredByOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (runs ?? [])
            .map((run) => run.triggeredByName)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [runs],
  );

  const filteredRuns = useMemo(() => {
    return (runs ?? []).filter((run) => {
      const status = getStatusFilterValue(run);
      const actionLabel = actionLabels[run.actionName] ?? run.actionName;
      const haystack = [
        actionLabel,
        run.actionName,
        run.triggeredByName ?? "",
        run.contextType ?? "",
        run.contextName ?? "",
        run.contextPath ?? "",
        run.workflowRef ?? "",
        run.sha ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (actionFilter !== "all" && run.actionName !== actionFilter)
        return false;
      if (
        triggeredByFilter !== "all" &&
        run.triggeredByName !== triggeredByFilter
      )
        return false;
      if (search && !haystack.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [
    actionFilter,
    actionLabels,
    runs,
    search,
    statusFilter,
    triggeredByFilter,
  ]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, statusFilter, actionFilter, triggeredByFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRuns.length / PAGE_SIZE));

  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pageIndex]);

  const paginationItems = useMemo(() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i);
    }

    const pages = new Set<number>([0, pageCount - 1, pageIndex]);
    if (pageIndex - 1 >= 0) pages.add(pageIndex - 1);
    if (pageIndex + 1 < pageCount) pages.add(pageIndex + 1);

    const ordered = Array.from(pages).sort((a, b) => a - b);
    const items: Array<number | "ellipsis"> = [];

    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0 && ordered[i] - ordered[i - 1] > 1) {
        items.push("ellipsis");
      }
      items.push(ordered[i]);
    }

    return items;
  }, [pageCount, pageIndex]);

  const pagedRuns = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredRuns.slice(start, start + PAGE_SIZE);
  }, [filteredRuns, pageIndex]);

  const hasActiveFilters =
    search !== "" ||
    statusFilter !== "all" ||
    actionFilter !== "all" ||
    triggeredByFilter !== "all";

  const headerNode = useMemo(
    () => (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-lg">Actions</h1>
        </div>
        <div className="flex items-center gap-2">
          <ButtonGroup>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-44"
            />
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="icon">
                      <Funnel />
                      <span className="sr-only">Open filters</span>
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Filters</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-56 p-3">
                <div className="grid gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="succeeded">Succeeded</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      {actionOptions.map((actionName) => (
                        <SelectItem key={actionName} value={actionName}>
                          {actionLabels[actionName] ?? actionName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={triggeredByFilter}
                    onValueChange={setTriggeredByFilter}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Triggered by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      {triggeredByOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
          </ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!hasActiveFilters}
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setActionFilter("all");
                  setTriggeredByFilter("all");
                }}
              >
                <CircleX />
                <span className="sr-only">Reset filters</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset filters</TooltipContent>
          </Tooltip>
        </div>
      </div>
    ),
    [
      actionFilter,
      actionLabels,
      actionOptions,
      hasActiveFilters,
      search,
      statusFilter,
      triggeredByFilter,
      triggeredByOptions,
    ],
  );

  useRepoHeader({ header: headerNode });

  if (runs == null) {
    return <ActionsTableSkeleton />;
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Context</TableHead>
            <TableHead>Triggered</TableHead>
            <TableHead>Triggered by</TableHead>
            <TableHead>Ref</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRuns.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-muted-foreground"
              >
                {runs.length === 0 ? "No actions yet." : "No matching actions."}
              </TableCell>
            </TableRow>
          ) : (
            pagedRuns.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>{getRunIcon(run)}</TooltipTrigger>
                    <TooltipContent>{getStatusLabel(run)}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="font-mono font-medium">
                  {run.actionName}
                </TableCell>
                <TableCell>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <UnderlinedTrigger>
                        {formatContext(run, contextLabels)}
                      </UnderlinedTrigger>
                    </HoverCardTrigger>
                    <HoverCardContent align="start">
                      <ul className="space-y-2 text-sm">
                        {formatDetails(run).map((item) => (
                          <li key={item.label}>
                            <span className="font-medium">{item.label}: </span>
                            <DetailValue value={item.value} />
                          </li>
                        ))}
                      </ul>
                    </HoverCardContent>
                  </HoverCard>
                </TableCell>
                <TableCell>
                  {run.createdAt
                    ? formatDistanceToNowStrict(new Date(run.createdAt), {
                        addSuffix: true,
                      })
                    : "-"}
                </TableCell>
                <TableCell>
                  {run.triggeredByName ? (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <UnderlinedTrigger>
                          {run.triggeredByName}
                        </UnderlinedTrigger>
                      </HoverCardTrigger>
                      <HoverCardContent align="start">
                        <div className="flex items-start gap-3">
                          <Avatar className="size-10">
                            <AvatarImage
                              src={
                                run.triggeredByGithubUsername
                                  ? `https://github.com/${run.triggeredByGithubUsername}.png`
                                  : run.triggeredByEmail
                                    ? `https://unavatar.io/${run.triggeredByEmail}?fallback=false`
                                    : (run.triggeredByImage ?? undefined)
                              }
                              alt={run.triggeredByName}
                            />
                            <AvatarFallback>
                              {getInitialsFromName(
                                run.triggeredByName ?? undefined,
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="grid gap-1 text-sm">
                            <div className="font-medium">
                              {run.triggeredByName}
                            </div>
                            {run.triggeredByGithubUsername ? (
                              <Link
                                href={`https://github.com/${run.triggeredByGithubUsername}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                @{run.triggeredByGithubUsername}
                              </Link>
                            ) : null}
                            {run.triggeredByEmail ? (
                              <div className="text-muted-foreground">
                                {run.triggeredByEmail}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">-</div>
                            )}
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  {run.sha ? (
                    <Link
                      href={getShaUrl(owner, repo, run.sha)!}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[13px] hover:underline"
                    >
                      {run.workflowRef
                        ? `${run.workflowRef}@${run.sha.slice(0, 7)}`
                        : run.sha.slice(0, 7)}
                    </Link>
                  ) : (
                    <span className="font-mono text-[13px]">
                      {run.workflowRef ?? "-"}
                    </span>
                  )}
                </TableCell>
              <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon-sm">
                        <EllipsisVertical className="size-4" />
                        <span className="sr-only">Run actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild disabled={!run.htmlUrl}>
                        <Link
                          href={run.htmlUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on GitHub
                          <ArrowUpRight className="ml-auto size-3 text-muted-foreground" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!run.canRerun}
                        onClick={() => void handleRunAction(run, "rerun")}
                      >
                        Run again
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!run.canCancel}
                        onClick={() => void handleRunAction(run, "cancel")}
                      >
                        Cancel run
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ActionsPagination
        pageCount={pageCount}
        pageIndex={pageIndex}
        paginationItems={paginationItems}
        onPrevious={() => {
          if (pageIndex > 0) setPageIndex((current) => current - 1);
        }}
        onNext={() => {
          if (pageIndex < pageCount - 1) {
            setPageIndex((current) => current + 1);
          }
        }}
        onPageSelect={setPageIndex}
      />
    </div>
  );
}
