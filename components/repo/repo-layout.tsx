"use client";

import { useEffect } from "react";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { trackVisit } from "@/lib/tracker";
import { RepoHeaderProvider, useRepoHeaderState } from "@/components/repo/repo-header-context";

function RepoHeader() {
  const { breadcrumb, actions } = useRepoHeaderState();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0">{breadcrumb}</div>
      </div>
      <div className="ml-4 flex shrink-0 items-center">{actions}</div>
    </header>
  );
}

export function RepoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { config } = useConfig();
  const { owner, repo } = useRepo();

  useEffect(() => {
    if (config?.owner && config?.repo && config?.branch) {
      trackVisit(owner, repo, config.branch);
    }
  }, [config, owner, repo]);

  return (
    <SidebarProvider>
      <RepoHeaderProvider>
        <RepoSidebar />
        <SidebarInset className="h-screen overflow-hidden">
          <RepoHeader />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </SidebarInset>
      </RepoHeaderProvider>
    </SidebarProvider>
  );
}
