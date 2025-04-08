"use client";

import { useEffect, useState } from "react";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { trackVisit } from "@/lib/tracker";

export function RepoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const { config } = useConfig();
  const { owner, repo } = useRepo();

  const handleMenuClose = () => setMenuOpen(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    if (isMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      window.removeEventListener("keydown", handleKeyDown);
    }

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  useEffect(() => {
    if (config?.owner && config?.repo && config?.branch) {
      trackVisit(owner, repo, config.branch);
    }
  }, [config, owner, repo]);

  return (
    <>
      <div className="flex h-screen w-full">
        <aside className="hidden xl:flex flex-col h-screen w-72 border-r gap-y-2">
          <RepoSidebar/>
        </aside>
        <main className="flex flex-col flex-1 relative h-screen overflow-hidden">
          <div className="h-14 xl:h-0"></div>
          <div className="flex-1 overflow-auto scrollbar p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
      <div className="xl:hidden">
        <div className="fixed top-0 left-0 right-0 bg-background border-b h-14 flex items-center px-4 md:px-6">
          <Button variant="outline" size="icon" className="gap-x-2" onClick={() => setMenuOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>
        <div className={cn(
            "invisible opacity-0 fixed inset-0 z-50 transition-all duration-150 bg-black/80",
            isMenuOpen ? "visible opacity-100" : ""
          )}
          onClick={handleMenuClose}
        ></div>
        <aside
          className={cn(
            "bg-background invisible opacity-0 fixed inset-y-0 z-50 -translate-x-full transition-all ease-in-out duration-500 flex flex-col gap-y-2 h-screen max-w-72 w-[calc(100vw-4rem)] border-r shadow-lg",
            isMenuOpen ? "visible opacity-100 translate-x-0 " : ""
          )}>
          <RepoSidebar onClick={handleMenuClose}/>
        </aside>
      </div>
    </>
  );
}