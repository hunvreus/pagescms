"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useUser } from "@/contexts/user-context";
import { useI18n } from "@/contexts/i18n-context";
import { signOut } from "@/lib/auth-client";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Settings, LogOut } from "lucide-react";

export function User({ className, onClick, align = "end" }: { className?: string; onClick?: () => void; align?: "start" | "center" | "end" }) {
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className={cn(className, "rounded-full")}><Avatar className="size-6"><AvatarImage src={user.githubUsername ? `https://github.com/${user.githubUsername}.png` : `https://unavatar.io/${user.email}?fallback=false`} alt={user.name || user.email} /><AvatarFallback>{getInitialsFromName(user.name ?? undefined)}</AvatarFallback></Avatar></Button></DropdownMenuTrigger>
      <DropdownMenuContent forceMount align={align} className="max-w-[12.5rem]">
        <DropdownMenuLabel><div className="text-sm font-medium truncate">{user.name || user.githubUsername || user.email}</div><div className="text-xs font-normal text-muted-foreground truncate">{user.email}</div></DropdownMenuLabel>
        <DropdownMenuSeparator /><DropdownMenuLabel className="w-40 text-xs text-muted-foreground font-medium">{t("user.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}><DropdownMenuRadioItem value="light" onClick={onClick}>{t("user.light")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark" onClick={onClick}>{t("user.dark")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="system" onClick={onClick}>{t("user.system")}</DropdownMenuRadioItem></DropdownMenuRadioGroup>
        <DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/settings">{t("user.settings")}</Link></DropdownMenuItem><DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={async () => { if (onClick) onClick(); await signOut(); window.location.assign("/sign-in"); }}><LogOut className="mr-2 size-4" />{t("user.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
