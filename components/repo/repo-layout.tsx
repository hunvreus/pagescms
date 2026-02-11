"use client";

import { useEffect } from "react";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { trackVisit } from "@/lib/tracker";

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
      <RepoSidebar />
      <SidebarInset className="h-screen overflow-hidden">
        <header className="flex h-12 shrink-0 items-center border-b px-4 md:px-6">
          <SidebarTrigger className="md:hidden" />
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
