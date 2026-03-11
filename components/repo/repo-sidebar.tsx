"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { useUser } from "@/contexts/user-context";
import { signOut } from "@/lib/auth-client";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { RepoBranches } from "@/components/repo/repo-branches";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { User } from "@/components/user";
import { About } from "@/components/about";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronsUpDown,
  FileStack,
  FileText,
  FolderOpen,
  LogOut,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-react";

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

function RepoSwitcher() {
  const router = useRouter();
  const { owner, repo, branches = [] } = useRepo();
  const { config } = useConfig();
  const currentBranch = config?.branch ?? "";
  const sortedBranches = useMemo(() => [...branches].sort((a, b) => a.localeCompare(b)), [branches]);

  const handleBranchChange = (branch: string) => {
    router.push(`/${owner}/${repo}/${encodeURIComponent(branch)}`);
  };

  return (
    <Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
            <Avatar className="h-8 w-8 rounded-md">
              <AvatarImage src={`https://github.com/${owner}.png`} alt={owner} />
              <AvatarFallback>{owner.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{repo}</span>
              <span className="truncate text-xs text-muted-foreground">{currentBranch || owner}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] rounded-lg" align="start">
          <DropdownMenuItem asChild>
            <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer">
              View on GitHub
              <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Branches</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={currentBranch} onValueChange={handleBranchChange}>
            {sortedBranches.map((branch) => (
              <DropdownMenuRadioItem key={branch} value={branch}>
                <span className="truncate">{branch}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DialogTrigger asChild>
            <DropdownMenuItem>Manage branches</DropdownMenuItem>
          </DialogTrigger>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/" prefetch={true}>Change project</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage branches</DialogTitle>
        </DialogHeader>
        <RepoBranches />
      </DialogContent>
    </Dialog>
  );
}

export function RepoSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { config } = useConfig();

  const contentItems = useMemo<NavItem[]>(() => {
    if (!config?.object) return [];
    const content = (config.object as any).content ?? [];

    return content.map((item: any) => ({
      key: `content-${item.name}`,
      label: item.label || item.name,
      href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${item.type}/${encodeURIComponent(item.name)}`,
      icon: item.type === "collection" ? <FileStack className="size-4" /> : <FileText className="size-4" />,
    }));
  }, [config]);

  const mediaItems = useMemo<NavItem[]>(() => {
    if (!config?.object) return [];
    const media = (config.object as any).media ?? [];

    return media.map((item: any) => ({
      key: `media-${item.name || "default"}`,
      label: item.label || item.name || "Media",
      href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${item.name}`,
      icon: <FolderOpen className="size-4" />,
    }));
  }, [config]);

  const adminItems = useMemo<NavItem[]>(() => {
    if (!config) return [];

    const items: NavItem[] = [];
    if (user?.githubUsername) {
      items.push({
        key: "admin-collaborators",
        label: "Collaborators",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collaborators`,
        icon: <Users className="size-4" />,
      });
    }

    if (user?.githubUsername && !(config.object as any)?.settings?.hide) {
      items.push({
        key: "admin-settings",
        label: "Settings",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/settings`,
        icon: <Settings className="size-4" />,
      });
    }

    return items;
  }, [config, user?.githubUsername]);

  const renderGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link href={item.href}>
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const groups = [
    renderGroup("Content", contentItems),
    renderGroup("Media", mediaItems),
    renderGroup("Admin", adminItems),
  ].filter(Boolean);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <RepoSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group, index) => (
          <Fragment key={index}>{group}</Fragment>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center justify-between gap-2">
          <User />
          <About />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
