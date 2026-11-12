"use client";

import { useUser } from "@/contexts/user-context";
import { useI18n } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import { getGithubInstallationUrl } from "@/lib/github-app";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowUpRight, Ban, EllipsisVertical } from "lucide-react";

const Installations = () => {
  const { user } = useUser();
  const { t } = useI18n();
  if (!user || !user.accounts) return <div className="text-sm text-muted-foreground h-[50px] px-6 flex justify-center items-center bg-accent rounded-md"><Ban className="h-4 w-4 mr-2" />{t("settings.noInstallation")}</div>;
  return <ul>{user.accounts.map((account) => <li className="flex items-center gap-x-3 border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm" key={`${account.login}-${account.installationId}`}><div className="flex gap-x-2 items-center"><img src={`https://github.com/${account.login}.png`} alt={`${account.login} 的头像`} className="h-6 w-6 rounded" /><span className="font-medium truncate hover:underline">{account.login}</span></div><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-xs" variant="outline" className="ml-auto"><EllipsisVertical className="h-4 w-4" /><span className="sr-only">{t("settings.installationActions")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><a href={getGithubInstallationUrl(account)} target="_blank" rel="noreferrer">{t("settings.manageGitHubApp")}<ArrowUpRight className="size-3 text-muted-foreground ml-auto" /></a></DropdownMenuItem></DropdownMenuContent></DropdownMenu></li>)}</ul>;
};

export { Installations };
