"use client";

import { useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpRight, Ban, EllipsisVertical } from "lucide-react";

const getInstallationUrl = (account: {
  type: string;
  login: string;
  installationId?: number | null;
}) => {
  if (account.type === "org") {
    return `https://github.com/organizations/${account.login}/settings/installations/${account.installationId ?? ""}`;
  }

  return `https://github.com/settings/installations/${account.installationId ?? ""}`;
};

const Installations = () => {
  const { user } = useUser();

  if (!user || !user.accounts) {
    return (
      <div className="text-sm text-muted-foreground h-[50px] px-6 flex justify-center items-center bg-accent rounded-md">
        <Ban className="h-4 w-4 mr-2" />
        No account with the Github application installed.
      </div>
    );
  }

  return (
    <ul>
      {user.accounts.map((account) => (
        <li
          className="flex items-center gap-x-3 border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm"
          key={account.login}
        >
          <div className="flex gap-x-2 items-center">
            <img
              src={`https://github.com/${account.login}.png`}
              alt={`${account.login}'s avatar`}
              className="h-6 w-6 rounded"
            />
            <span className="font-medium truncate hover:underline">{account.login}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="outline" className="ml-auto">
                <EllipsisVertical className="h-4 w-4" />
                <span className="sr-only">Installation actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a
                  href={getInstallationUrl(account)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage on GitHub
                  <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  );
};

export { Installations };
