import { redirect } from "next/navigation";
import { getConfig } from "@/lib/utils/config";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoLayout } from "@/components/repo/repo-layout";
import { getServerSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; branch: string; }>;
}) {
  const { owner, repo, branch } = await params;
  const session = await getServerSession();
  const user = session?.user;
  if (!user) return redirect("/sign-in");

  const decodedBranch = decodeURIComponent(branch);

  let config = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch: decodedBranch,
    sha: "",
    version: "",
    object: {}
  }
  
  let errorMessage = null;

  try {
    const { token } = await getToken(user, owner, repo);
    const syncedConfig = await getConfig(
      owner,
      repo,
      decodedBranch,
      {
        getToken: async () => token,
      },
    );

    if (syncedConfig) {
      config = syncedConfig;
    }
  } catch (error: any) {
    if (error.status === 404) {
      if (error.response?.data?.message === "Not Found") {
        // Let downstream pages (especially /configuration via Entry) handle missing .pages.yml.
      } else {
        // We assume the branch is not valid
        errorMessage = (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>Invalid branch</EmptyTitle>
              <EmptyDescription>{`The branch "${decodedBranch}" doesn't exist. It may have been removed or renamed.`}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants({ variant: "default", size: "sm" })} href={`/${owner}/${repo}`}>
                Switch to the default branch
              </Link>
            </EmptyContent>
          </Empty>
        );
      }
    } else if (error.status === 403) {
      errorMessage = (
        <Empty className="absolute inset-0 border-0 rounded-none">
          <EmptyHeader>
            <EmptyTitle>You can't access this repository.</EmptyTitle>
            <EmptyDescription>You do not have sufficient permissions to access this repository.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link className={buttonVariants({ variant: "default", size: "sm" })} href="/">
              Select another repository
            </Link>
          </EmptyContent>
        </Empty>
      );
    } else {
      throw error;
    }
  }

  return (
    <ConfigProvider value={config}>
      <RepoLayout>{errorMessage ? errorMessage : children}</RepoLayout>
    </ConfigProvider>
  );
}
