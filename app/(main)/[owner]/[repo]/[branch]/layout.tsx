import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { getConfigWithSync } from "@/lib/utils/config";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoLayout } from "@/components/repo/repo-layout";
import { Message } from "@/components/message";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; branch: string; }>;
}) {
  const { owner, repo, branch } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
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
    const syncedConfig = await getConfigWithSync(
      owner,
      repo,
      decodedBranch,
      async () => {
        const token = await getToken(user, owner, repo);
        if (!token) throw new Error("Token not found");
        return token;
      },
      {
        backgroundRefreshWhenStale: true,
      },
    );

    if (syncedConfig) {
      config = syncedConfig;
    }
  } catch (error: any) {
    if (error.status === 404) {
      if (error.response?.data?.message === "Not Found") {
        // Let downstream pages (especially /settings via Entry) handle missing .pages.yml.
      } else {
        // We assume the branch is not valid
        errorMessage = (
          <Message
            title="Invalid branch"
            description={`The branch "${decodedBranch}" doesn't exist. It may have been removed or renamed.`}
            className="absolute inset-0"
            href={`/${owner}/${repo}`}
            cta={"Switch to the default branch"}
          />
        );
      }
    } else if (error.status === 403) {
      errorMessage = (
        <Message
          title="You can't access this repository."
          description={<>You do not have sufficient permissions to access this repository.</>}
          className="absolute inset-0"
          href="/"
          cta="Select another repository"
        />
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
