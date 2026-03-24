"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz";
import { isCacheEnabled, isConfigEnabled } from "@/lib/config-settings";
import { getVisits } from "@/lib/tracker";
import { RepoBranches } from "@/components/repo/repo-branches";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronsUpDown,
  Database,
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

type NavigationNode = {
  type: "group" | "file" | "collection" | "media";
  name: string;
  label?: string;
  items?: NavigationNode[];
};

function RepoSwitcher() {
  const router = useRouter();
  const { owner, repo, branches = [] } = useRepo();
  const { config } = useConfig();
  const currentBranch = config?.branch ?? "";
  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.localeCompare(b)),
    [branches],
  );
  const [recentRepos, setRecentRepos] = useState<
    Array<{ owner: string; repo: string; branch: string }>
  >([]);
  const triggerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = triggerWrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      setMenuWidth(el.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(el);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  const loadRecentRepos = useCallback(() => {
    const visits = getVisits()
      .filter(
        (visit) =>
          !(
            visit.owner.toLowerCase() === owner.toLowerCase() &&
            visit.repo.toLowerCase() === repo.toLowerCase()
          ),
      )
      .slice(0, 3)
      .map((visit) => ({
        owner: visit.owner,
        repo: visit.repo,
        branch: visit.branch,
      }));
    setRecentRepos(visits);
  }, [owner, repo]);

  useEffect(() => {
    loadRecentRepos();
  }, [loadRecentRepos]);

  const handleBranchChange = (branch: string) => {
    router.push(`/${owner}/${repo}/${encodeURIComponent(branch)}`);
  };

  return (
    <Dialog>
      <div ref={triggerWrapperRef}>
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) loadRecentRepos();
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarImage
                  src={`https://github.com/${owner}.png`}
                  alt={owner}
                />
                <AvatarFallback>
                  {owner.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{repo}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentBranch || owner}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="rounded-lg"
            align="start"
            style={
              menuWidth
                ? { width: `${menuWidth}px`, minWidth: `${menuWidth}px` }
                : undefined
            }
          >
            <DropdownMenuItem asChild>
              <a
                href={`https://github.com/${owner}/${repo}`}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
                <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Branches
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={currentBranch}
              onValueChange={handleBranchChange}
            >
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
            {recentRepos.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Recently visited
                </DropdownMenuLabel>
                {recentRepos.map((visit) => (
                  <DropdownMenuItem
                    asChild
                    key={`${visit.owner}/${visit.repo}/${visit.branch}`}
                  >
                    <Link
                      href={`/${visit.owner}/${visit.repo}/${encodeURIComponent(visit.branch)}`}
                    >
                      <img
                        src={`https://github.com/${visit.owner}.png`}
                        alt={`${visit.owner}'s avatar`}
                        className="size-5 rounded"
                      />
                      <span className="truncate">{visit.repo}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/">All projects</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
  const { isMobile, setOpenMobile } = useSidebar();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, pathname, setOpenMobile]);

  const handleNavigation = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const contentNavigation = useMemo<NavigationNode[]>(() => {
    if (!config?.object) return [];
    const navigation = (config.object as any).navigation?.content;
    if (Array.isArray(navigation)) return navigation;

    const content = (config.object as any).content ?? [];
    return content.map((item: any) => ({
      type: item.type,
      name: item.name,
      label: item.label || item.name,
    }));
  }, [config]);

  const mediaNavigation = useMemo<NavigationNode[]>(() => {
    if (!config?.object) return [];
    const navigation = (config.object as any).navigation?.media;
    if (Array.isArray(navigation)) return navigation;

    const media = (config.object as any).media ?? [];
    return media.map((item: any) => ({
      type: "media",
      name: item.name || "default",
      label: item.label || item.name || "Media",
    }));
  }, [config]);

  const adminItems = useMemo<NavItem[]>(() => {
    if (!config) return [];
    const canManageRepo = hasGithubIdentity(user);

    const items: NavItem[] = [];

    const configObject = (config.object as any) ?? {};

    if (canManageRepo && isCacheEnabled(configObject)) {
      items.push({
        key: "admin-cache",
        label: "Cache",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/cache`,
        icon: <Database className="size-4" />,
      });
    }

    if (canManageRepo) {
      items.push({
        key: "admin-collaborators",
        label: "Collaborators",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collaborators`,
        icon: <Users className="size-4" />,
      });
    }

    if (canManageRepo && isConfigEnabled(configObject)) {
      items.push({
        key: "admin-configuration",
        label: "Configuration",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/configuration`,
        icon: <Settings className="size-4" />,
      });
    }

    return items;
  }, [config, user]);

  const getNodeHref = (node: NavigationNode) => {
    if (!config) return "#";
    if (node.type === "media") {
      return `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${encodeURIComponent(node.name)}`;
    }
    return `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${node.type}/${encodeURIComponent(node.name)}`;
  };

  const getNodeIcon = (node: NavigationNode) => {
    if (node.type === "collection") return <FileStack className="size-4" />;
    if (node.type === "media") return <FolderOpen className="size-4" />;
    return <FileText className="size-4" />;
  };

  function hasActiveDescendant(node: NavigationNode): boolean {
    if (node.type !== "group") {
      const href = getNodeHref(node);
      return pathname === href || pathname.startsWith(`${href}/`);
    }
    return (node.items || []).some((item) => hasActiveDescendant(item));
  }

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [key]: !(current[key] ?? false),
    }));
  }, []);

  function renderNavigationNode(node: NavigationNode, key: string, nested: boolean = false): React.ReactNode {
    if (node.type === "group") {
      const isActive = hasActiveDescendant(node);
      const isOpen = expandedGroups[key] ?? isActive;
      if (nested) {
        return (
            <SidebarMenuSubItem key={key}>
              <SidebarMenuSubButton
                asChild
              >
                <button type="button" onClick={() => toggleGroup(key)}>
                  <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                  <span>{node.label || node.name}</span>
              </button>
            </SidebarMenuSubButton>
            {isOpen && node.items && node.items.length > 0 && (
              <SidebarMenuSub>
                {node.items.map((item) => renderNavigationNode(item, `${key}-${item.name}`, true))}
              </SidebarMenuSub>
            )}
          </SidebarMenuSubItem>
        );
      }

      return (
        <SidebarMenuItem key={key}>
          <SidebarMenuButton
            asChild
          >
            <button type="button" onClick={() => toggleGroup(key)}>
              <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
              <span>{node.label || node.name}</span>
            </button>
          </SidebarMenuButton>
          {isOpen && node.items && node.items.length > 0 && (
            <SidebarMenuSub>
              {node.items.map((item) => renderNavigationNode(item, `${key}-${item.name}`, true))}
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      );
    }

    const href = getNodeHref(node);
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    if (nested) {
      return (
        <SidebarMenuSubItem key={key}>
          <SidebarMenuSubButton asChild isActive={isActive}>
            <Link href={href}>
              {getNodeIcon(node)}
              <span>{node.label || node.name}</span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      );
    }

    return (
      <SidebarMenuItem key={key}>
        <SidebarMenuButton asChild isActive={isActive}>
          <Link href={href}>
            {getNodeIcon(node)}
            <span>{node.label || node.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const renderNavigationGroup = (label: string, nodes: NavigationNode[]) => {
    if (nodes.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {nodes.map((node) => renderNavigationNode(node, `${label}-${node.name}`))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const renderFlatGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link href={item.href} onClick={handleNavigation}>
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
    renderNavigationGroup("Content", contentNavigation),
    renderNavigationGroup("Media", mediaNavigation),
    renderFlatGroup("Admin", adminItems),
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
          <User align="start" />
          <About />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
