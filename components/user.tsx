"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useUser } from "@/contexts/user-context";
import { handleSignOut }  from "@/lib/actions/auth";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { Button } from "@/components/ui/button";
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
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

export function User({
  className,
  onClick
}: {
  className?: string,
  onClick?: () => void
}) {
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={cn(className, "rounded-full")}>
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={
                user?.githubId
                  ? `https://avatars.githubusercontent.com/u/${user.githubId}`
                  : `https://unavatar.io/${user?.email}?fallback=false`
              }
              alt={
                user?.githubId
                  ? user.githubUsername
                  : user.email
              }
            />
            <AvatarFallback>{getInitialsFromName(user.githubName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent forceMount align="start" className="max-w-[12.5rem]">
        <DropdownMenuLabel>
          {user?.githubId
            ? <>
                <div className="text-sm font-medium truncate">{user.githubName ? user.githubName : user.githubUsername}</div>
                <div className="text-xs font-normal text-muted-foreground truncate">{user.githubEmail}</div>
              </>
            : <div className="text-sm font-medium truncate">{user.email}</div>
          }
        </DropdownMenuLabel>
        {user?.githubId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={`https://github.com/${user.githubUsername}`} target="_blank" onClick={onClick}>
                <span className="mr-4">See GitHub profile</span>
                <ArrowUpRight className="h-3 w-3 ml-auto opacity-50" />
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="w-40 text-xs text-muted-foreground font-medium">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" onClick={onClick}>Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" onClick={onClick}>Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" onClick={onClick}>System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { if (onClick) onClick(); await handleSignOut() }}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}