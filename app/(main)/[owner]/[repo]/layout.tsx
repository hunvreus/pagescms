import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getToken } from "@/lib/token";
import { RepoProvider } from "@/contexts/repo-context";
import { getServerSession } from "@/lib/session-server";
import { getRepoSnapshot } from "@/lib/github-cache-file";
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
  const requestHeaders = await headers();
  const session = await getServerSession();
  const user = session?.user;
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!user) return redirect(signInUrl);

  try {
    const { token } = await getToken(user, owner, repo);
    if (!token) throw new Error("Token not found");

    const repoInfo = await getRepoSnapshot(owner, repo, token);
    const branchNames = repoInfo.branches ?? [];
    
    if (branchNames.length === 0) {
      return(
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>Empty repository</EmptyTitle>
            <EmptyDescription>Create a branch and add a &quot;.pages.yml&quot; file to configure this repository.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className={buttonVariants({ variant: "default" })} href="/">
              Choose another repository
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
              <EmptyTitle>Repository not found</EmptyTitle>
              <EmptyDescription>It may have been removed, renamed, or the URL may be incorrect.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants({ variant: "default" })} href="/">
                Choose another repository
              </Link>
            </EmptyContent>
          </Empty>
        ); 
      case 403:
        return(
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>Access denied</EmptyTitle>
              <EmptyDescription>You do not have permission to access this repository.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants({ variant: "default" })} href="/">
                Choose another repository
              </Link>
            </EmptyContent>
          </Empty>
        ); 
      default:
        throw error;
    }
  }
}
