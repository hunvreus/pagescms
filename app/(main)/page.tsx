"use client";

import { useEffect, useState } from "react";
import { handleAppInstall } from "@/lib/actions/app";
import { useUser } from "@/contexts/user-context";
import { RepoSelect } from "@/components/repo/repo-select";
import { RepoTemplates } from "@/components/repo/repo-templates";
import { RepoLatest } from "@/components/repo/repo-latest";
import { SubmitButton } from "@/components/submit-button";
import { DocumentTitle } from "@/components/document-title";
import { hasGithubIdentity } from "@/lib/authz";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { MainRootLayout } from "./main-root-layout";
import { getVisits } from "@/lib/tracker";

export default function Page() {
  const [defaultAccount, setDefaultAccount] = useState<any>(null);
  const [hasRecentVisits, setHasRecentVisits] = useState(false);
  const { user } = useUser();
  const isGithubUser = hasGithubIdentity(user);

  useEffect(() => {
    setHasRecentVisits(getVisits().length > 0);
  }, []);

  if (!user) throw new Error("User not found");
  if (!user.accounts) throw new Error("Accounts not found");

  return (
    <MainRootLayout>
      <DocumentTitle title="Projects" />
      <div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-8">
        {user.accounts.length > 0 ? (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col justify-center space-y-8">
            {hasRecentVisits && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium tracking-tight">
                  Recently visited
                </h2>
                <RepoLatest />
              </div>
            )}
            <div className="space-y-4">
              <h2 className="text-lg font-medium tracking-tight">
                Open a project
              </h2>
              <RepoSelect
                onAccountSelect={(account) => setDefaultAccount(account)}
              />
            </div>
            {isGithubUser && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium tracking-tight">
                  Create from a template
                </h2>
                <RepoTemplates defaultAccount={defaultAccount} />
              </div>
            )}
          </div>
        ) : isGithubUser ? (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>Install the GitHub App</EmptyTitle>
              <EmptyDescription>
                Pages CMS needs to be installed on at least one GitHub account
                before you can open or create projects.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <form action={handleAppInstall}>
                <SubmitButton type="submit" size="sm">
                  <svg
                    role="img"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="currentColor"
                  >
                    <title>GitHub</title>
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  Install the GitHub App
                </SubmitButton>
              </form>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>Nothing to see (yet)</EmptyTitle>
              <EmptyDescription>
                You must be invited to a repository to collaborate. Ask the
                person who invited you or manages your organization to invite
                you.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </MainRootLayout>
  );
}
