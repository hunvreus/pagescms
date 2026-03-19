"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingSidebar() {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" disabled>
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarFallback>..</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight gap-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Media</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function Loading() {
  return (
    <SidebarProvider>
      <LoadingSidebar />
      <SidebarInset className="min-h-screen">
        <main className="flex-1 p-4 md:p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
            <div className="grid gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
