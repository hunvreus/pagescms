import Link from "next/link";
import { desc, eq, or, sql } from "drizzle-orm";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { MainRootLayout } from "../main-root-layout";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/db";
import {
  accountTable,
  cacheFileMetaTable,
  cacheFileTable,
  cachePermissionTable,
  collaboratorTable,
  configTable,
  githubInstallationTokenTable,
  userTable,
} from "@/db/schema";
import { DocumentTitle } from "@/components/document-title";
import { AdminConfirmActionButton } from "@/components/admin-confirm-action-button";
import { AdminTimeAgo } from "@/components/admin-time-ago";
import { AdminUserSearch } from "@/components/admin-user-search";
import { AdminUserRowActions } from "@/components/admin-user-row-actions";
import { logoutAllUsers, logoutUserSessions, resetGlobalCache } from "@/lib/actions/admin";
import { buttonVariants } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils";

const formatDateTime = (value: Date | string | null | undefined) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatTimeAgoLabel = (
  value: Date | string | null | undefined,
  nowMs: number,
) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMs = nowMs - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

const formatCompactNumber = (value: number) => {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const USERS_PER_PAGE = 20;

const buildAdminUrl = (q: string, page: number) => {
  const searchParams = new URLSearchParams();
  if (q) searchParams.set("q", q);
  if (page > 1) searchParams.set("page", String(page));
  const query = searchParams.toString();
  return query ? `/admin?${query}` : "/admin";
};

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminSession();
  const nowMs = Date.now();
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const pageParam = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const lowerQuery = query.toLowerCase();

  const userSearchFilter = query
    ? or(
        sql`lower(${userTable.name}) like ${`%${lowerQuery}%`}`,
        sql`lower(${userTable.email}) like ${`%${lowerQuery}%`}`,
        sql`lower(coalesce(${userTable.githubUsername}, '')) like ${`%${lowerQuery}%`}`,
      )
    : undefined;

  const usersQuery = db.select({
    id: userTable.id,
    name: userTable.name,
    email: userTable.email,
    emailVerified: userTable.emailVerified,
    githubUsername: userTable.githubUsername,
    createdAt: userTable.createdAt,
    updatedAt: userTable.updatedAt,
    githubLinked: sql<boolean>`exists (
      select 1 from ${accountTable}
      where ${accountTable.userId} = ${userTable.id}
        and ${accountTable.providerId} = 'github'
    )`,
  }).from(userTable);

  const filteredUsersQuery = userSearchFilter
    ? usersQuery.where(userSearchFilter)
    : usersQuery;

  const [
    [userCount],
    [verifiedUserCount],
    [githubUserCount],
    [installCount],
    [repoCount],
    [collaboratorCount],
    [cacheFileCount],
    [cacheMetaCount],
    [cachePermissionCount],
    [filteredUserCount],
    users,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(userTable),
    db.select({ count: sql<number>`count(*)::int` }).from(userTable).where(eq(userTable.emailVerified, true)),
    db.select({ count: sql<number>`count(*)::int` }).from(accountTable).where(eq(accountTable.providerId, "github")),
    db.select({ count: sql<number>`count(*)::int` }).from(githubInstallationTokenTable),
    db.select({ count: sql<number>`count(distinct (${configTable.owner}, ${configTable.repo}))::int` }).from(configTable),
    db.select({ count: sql<number>`count(*)::int` }).from(collaboratorTable),
    db.select({ count: sql<number>`count(*)::int` }).from(cacheFileTable),
    db.select({ count: sql<number>`count(*)::int` }).from(cacheFileMetaTable),
    db.select({ count: sql<number>`count(*)::int` }).from(cachePermissionTable),
    userSearchFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(userTable).where(userSearchFilter)
      : db.select({ count: sql<number>`count(*)::int` }).from(userTable),
    filteredUsersQuery
      .orderBy(desc(userTable.createdAt))
      .limit(USERS_PER_PAGE)
      .offset((currentPage - 1) * USERS_PER_PAGE),
  ]);

  const totalUserPages = Math.max(1, Math.ceil((filteredUserCount?.count ?? 0) / USERS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalUserPages);

  return (
    <MainRootLayout>
      <DocumentTitle title="Admin" />
      <div className="max-w-screen-lg mx-auto p-4 md:p-6 space-y-6">
        <Link
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "inline-flex",
          )}
          href="/"
        >
          <ArrowLeft />
          Go home
        </Link>

        <header>
          <h1 className="font-semibold tracking-tight text-lg md:text-2xl">
            Admin
          </h1>
        </header>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>High-level installation metrics.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:pr-4 md:border-r">
                  <div className="mb-1.5 text-sm text-muted-foreground">Users</div>
                  <div className="text-3xl font-semibold tracking-tight">{formatCompactNumber(userCount?.count ?? 0)}</div>
                </div>
                <div className="md:px-4 md:border-r">
                  <div className="mb-1.5 text-sm text-muted-foreground">Installs</div>
                  <div className="text-3xl font-semibold tracking-tight">{formatCompactNumber(installCount?.count ?? 0)}</div>
                </div>
                <div className="md:px-4 md:border-r">
                  <div className="mb-1.5 text-sm text-muted-foreground">Configured repos</div>
                  <div className="text-3xl font-semibold tracking-tight">{formatCompactNumber(repoCount?.count ?? 0)}</div>
                </div>
                <div className="md:pl-4">
                  <div className="mb-1.5 text-sm text-muted-foreground">Cached files</div>
                  <div className="text-3xl font-semibold tracking-tight">{formatCompactNumber(cacheFileCount?.count ?? 0)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                Search and revoke active sessions for individual users or everyone at once.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center justify-between gap-2">
                <AdminUserSearch initialQuery={query} />
                <AdminConfirmActionButton
                  action={logoutAllUsers}
                  label="Log out all users"
                  title="Log out all users?"
                  description="This will revoke every active session and redirect everyone to sign in again."
                  confirmLabel="Log out all"
                  variant="outline"
                  size="sm"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 min-w-10" />
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>GitHub</TableHead>
                    <TableHead className="w-24 min-w-24">Created</TableHead>
                    <TableHead className="w-24 min-w-24">Updated</TableHead>
                    <TableHead className="w-12 min-w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length > 0 ? (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="w-10 min-w-10">
                          <Avatar size="sm">
                            <AvatarImage
                              src={
                                user.githubUsername
                                  ? `https://github.com/${user.githubUsername}.png`
                                  : `https://unavatar.io/${user.email}?fallback=false`
                              }
                              alt={user.name || user.email}
                            />
                            <AvatarFallback>
                              {getInitialsFromName(user.name || user.email)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <span className="truncate font-medium">{user.name || "-"}</span>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <div className="truncate text-sm">{user.email}</div>
                        </TableCell>
                        <TableCell>
                          {user.githubUsername ? (
                            <Link
                              href={`https://github.com/${user.githubUsername}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary"
                            >
                              @{user.githubUsername}
                            </Link>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="w-24 min-w-24">
                          <AdminTimeAgo
                            label={formatTimeAgoLabel(user.createdAt, nowMs)}
                            fullDate={formatDateTime(user.createdAt)}
                          />
                        </TableCell>
                        <TableCell className="w-24 min-w-24">
                          <AdminTimeAgo
                            label={formatTimeAgoLabel(user.updatedAt, nowMs)}
                            fullDate={formatDateTime(user.updatedAt)}
                          />
                        </TableCell>
                        <TableCell className="w-12 min-w-12 text-right">
                          <AdminUserRowActions
                            name={user.name || user.email}
                            action={logoutUserSessions.bind(null, user.id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
                <div>
                  Showing {users.length} of {filteredUserCount?.count ?? 0} users
                </div>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href={buildAdminUrl(query, Math.max(1, safeCurrentPage - 1))}
                        iconOnly
                        aria-disabled={safeCurrentPage <= 1}
                        className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-2 text-xs">
                        Page {safeCurrentPage} of {totalUserPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href={buildAdminUrl(query, Math.min(totalUserPages, safeCurrentPage + 1))}
                        iconOnly
                        aria-disabled={safeCurrentPage >= totalUserPages}
                        className={safeCurrentPage >= totalUserPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cache</CardTitle>
              <CardDescription>
                Global cache state across files, config, metadata, and permission checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm flex-1">
              <div className="grid rounded-md border md:grid-cols-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2 md:border-r md:border-b">
                  <span className="text-muted-foreground">Cached files</span>
                  <span className="font-medium">{cacheFileCount?.count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-3 py-2 md:border-r md:border-t-0 md:border-b">
                  <span className="text-muted-foreground">Cache metadata rows</span>
                  <span className="font-medium">{cacheMetaCount?.count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-3 py-2 md:border-r md:border-t-0 md:border-b">
                  <span className="text-muted-foreground">Permission cache rows</span>
                  <span className="font-medium">{cachePermissionCount?.count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-3 py-2 md:border-t-0 md:border-b">
                  <span className="text-muted-foreground">Collaborator rows</span>
                  <span className="font-medium">{collaboratorCount?.count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-3 py-2 md:border-r md:border-t-0">
                  <span className="text-muted-foreground">Verified users</span>
                  <span className="font-medium">{verifiedUserCount?.count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-3 py-2 md:border-t-0">
                  <span className="text-muted-foreground">GitHub identities</span>
                  <span className="font-medium">{githubUserCount?.count ?? 0}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <AdminConfirmActionButton
                action={resetGlobalCache}
                label="Reset cache"
                title="Reset cache?"
                description="This will clear cached files, cached config, cache metadata, and permission cache."
                confirmLabel="Reset"
                variant="outline"
                size="sm"
                icon={<RefreshCcw className="size-4" />}
              />
            </CardFooter>
          </Card>
        </div>
      </div>
    </MainRootLayout>
  );
}
