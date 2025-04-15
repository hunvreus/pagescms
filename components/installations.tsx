"use client";

import { useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { Ban, ArrowUpRight } from "lucide-react";

const Installations = () => {
  const { user } = useUser();

  if (!user || !user.accounts) {
    return (
      <div className="text-sm text-muted-foreground h-[50px] px-6 flex justify-center items-center bg-accent rounded-md">
        <Ban className="h-4 w-4 mr-2"/>
        No account with the Github application installed.
      </div>
    );
  }

  return (
    <ul>
      {user.accounts.map(account =>
        <li className="flex items-center gap-x-3 border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm" key={account.login}>
          <div className="flex gap-x-2 items-center">
            <img src={`https://github.com/${account.login}.png`} alt={`${account.login}'s avatar`} className="h-6 w-6 rounded"/>
            <span className="font-medium truncate">{account.login}</span>
          </div>
          <Button size="sm" variant="outline" className="h-8 ml-auto" asChild>
            <a
              href={account.type === 'org' 
                ? `https://github.com/organizations/${account.login}/settings/installations/${account.installationId ?? ''}`
                : `https://github.com/settings/installations/${account.installationId ?? ''}`} 
              target="_blank"
            >
              Manage
              <ArrowUpRight className="h-3 w-3 ml-1 opacity-50" />
            </a>
          </Button>
        </li>
      )}
    </ul>
  )
};

export { Installations };