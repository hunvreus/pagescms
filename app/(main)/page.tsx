"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/contexts/user-context";
import { useI18n } from "@/contexts/i18n-context";
import { RepoSelect } from "@/components/repo/repo-select";
import { RepoTemplates } from "@/components/repo/repo-templates";
import { RepoLatest } from "@/components/repo/repo-latest";
import { DocumentTitle } from "@/components/document-title";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { MainRootLayout } from "./main-root-layout";
import { getVisits } from "@/lib/tracker";
import { Github } from "lucide-react";

export default function Page() {
  const [defaultAccount, setDefaultAccount] = useState<any>(null);
  const [hasRecentVisits, setHasRecentVisits] = useState(false);
  const { user } = useUser();
  const { t } = useI18n();
  const isGithubUser = hasGithubIdentity(user);

  useEffect(() => { setHasRecentVisits(getVisits().length > 0); }, []);

  if (!user) throw new Error("User not found");
  if (!user.accounts) throw new Error("Accounts not found");

  return (
    <MainRootLayout>
      <DocumentTitle title={t("projects.title")} />
      <div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-8">
        {user.accounts.length > 0 ? (
          <div className="min-h-[calc(100vh-12rem)] flex flex-col justify-center space-y-8">
            {hasRecentVisits && <div className="space-y-4"><h2 className="text-lg font-medium tracking-tight">{t("projects.recentlyVisited")}</h2><RepoLatest /></div>}
            <div className="space-y-4">
              <h2 className="text-lg font-medium tracking-tight">{t("projects.openProject")}</h2>
              <RepoSelect onAccountSelect={(account) => setDefaultAccount(account)} />
            </div>
            {isGithubUser && <div className="space-y-4"><h2 className="text-lg font-medium tracking-tight">{t("projects.createFromTemplate")}</h2><RepoTemplates defaultAccount={defaultAccount} /></div>}
          </div>
        ) : isGithubUser ? (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader><EmptyTitle>{t("projects.installGitHubApp")}</EmptyTitle><EmptyDescription>{t("projects.installGitHubAppDescription")}</EmptyDescription></EmptyHeader>
            <EmptyContent>
              <Link href="/api/github-app/install" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Github className="size-4" />{t("projects.installGitHubApp")}
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader><EmptyTitle>{t("projects.noRepositories")}</EmptyTitle><EmptyDescription>{t("projects.invitationRequired")}</EmptyDescription></EmptyHeader>
          </Empty>
        )}
      </div>
    </MainRootLayout>
  );
}
