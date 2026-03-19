import { redirect } from "next/navigation";
import { getToken } from "@/lib/token";
import { RepoProvider } from "@/contexts/repo-context";
import { getServerSession } from "@/lib/session-server";
import { getRepoSnapshot } from "@/lib/github-cache";
import { GithubAuthExpired } from "@/components/github-auth-expired";
import { isGithubAuthError } from "@/lib/github-auth";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function Layout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; }>;
}) {
  const { owner, repo } = await params;
  const session = await getServerSession();
  const user = session?.user;
  if (!user) return redirect("/sign-in");

  try {
    const { token } = await getToken(user, owner, repo);
    if (!token) throw new Error("Token not found");

    const repoInfo = await getRepoSnapshot(owner, repo, token);
    const branchNames = repoInfo.branches ?? [];
    
    if (branchNames.length === 0) {
      return(
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>This repository is empty.</EmptyTitle>
            <EmptyDescription>You need to create a branch and add a ".pages.yml" file to configure it.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className={buttonVariants({ variant: "default", size: "sm" })} href="/">
              Select another repository
            </Link>
          </EmptyContent>
        </Empty>
      );
    }

    return (
      <RepoProvider repo={repoInfo}>
        {children}
      </RepoProvider>
    );
  } catch (error: any) {
    if (isGithubAuthError(error)) {
      return <GithubAuthExpired />;
    }

    switch (error.status) {
      case 404:
        // TODO: adjust as it may be the permissions as insufficient (suggest installing the app)
        return(
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>This repository doesn't exist.</EmptyTitle>
              <EmptyDescription>It may have been removed, renamed or the path may be wrong.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants({ variant: "default", size: "sm" })} href="/">
                Select another repository
              </Link>
            </EmptyContent>
          </Empty>
        ); 
      case 403:
        return(
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>You can't access this repository.</EmptyTitle>
              <EmptyDescription>You do not have the sufficient permissions to access this repository.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants({ variant: "default", size: "sm" })} href="/">
                Select another repository
              </Link>
            </EmptyContent>
          </Empty>
        ); 
      default:
        throw error;
    }
  }
}
