import { createOctokitInstance } from "@/lib/utils/octokit";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { RepoProvider } from "@/contexts/repo-context";
import { Message } from "@/components/message";
import { Repo } from "@/types/repo";

export default async function Layout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; }>;
}) {
  const { owner, repo } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;
  if (!user) return redirect("/sign-in");

  try {
    const token = await getToken(user, owner, repo);
    if (!token) throw new Error("Token not found");

    const octokit = createOctokitInstance(token);
    const [repoResponse, firstBranchesResponse] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }),
      octokit.rest.repos.listBranches({ owner, repo, page: 1, per_page: 100 }),
    ]);

    const branches = [...firstBranchesResponse.data];
    let page = 2;
    while (firstBranchesResponse.data.length === 100) {
      const branchesResponse = await octokit.rest.repos.listBranches({
        owner,
        repo,
        page,
        per_page: 100,
      });
      if (branchesResponse.data.length === 0) break;
      branches.push(...branchesResponse.data);
      if (branchesResponse.data.length < 100) break;
      page++;
    }

    const branchNames = branches.map(branch => branch.name);
    
    if (branchNames.length === 0) {
      return(
        <Message
          title="This repository is empty."
          description={`You need to create a branch and add a ".pages.yml" file to configure it.`}
          className="absolute inset-0"
          cta="Select another repository"
          href="/"
        />
      );
    }

    const repoInfo: Repo = {
      id: repoResponse.data.id,
      owner: repoResponse.data.owner.login,
      ownerId: repoResponse.data.owner.id,
      repo: repoResponse.data.name,
      defaultBranch: repoResponse.data.default_branch,
      branches: branchNames,
      isPrivate: repoResponse.data.private
    };

    return (
      <RepoProvider repo={repoInfo}>
        {children}
      </RepoProvider>
    );
  } catch (error: any) {
    switch (error.status) {
      case 404:
        // TODO: adjust as it may be the permissions as insufficient (suggest installing the app)
        return(
          <Message
            title="This repository doesn't exist."
            description={<>It may have been removed, renamed or the path may be wrong.</>}
            className="absolute inset-0"
            cta="Select another repository"
            href="/"
          />
        ); 
      case 403:
        return(
          <Message
            title="You can't access this repository."
            description={<>You do not have the sufficient permissions to access this repository.</>}
            className="absolute inset-0"
            cta="Select another repository"
            href="/"
          />
        ); 
      default:
        throw error;
    }
  }
}
