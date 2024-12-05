"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { RepoBranches } from "./repo-branches";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ArrowUpRight, ChevronsUpDown } from "lucide-react";

export function RepoDropdown({
  onClick
}: {
  onClick?: () => void;
}) {
  const router = useRouter();
  const { owner, repo, branches, defaultBranch } = useRepo();
  const{ config } = useConfig();

  const displayBranches = useMemo(() => {
    let branchesToDisplay: string[] = [];
    if (config) {
      if (branches && branches.length > 0) {
        if (branches.includes(config.branch)) branchesToDisplay.push(config.branch);
        if (defaultBranch && config.branch !== defaultBranch) branchesToDisplay.push(defaultBranch);
        branchesToDisplay = branchesToDisplay.concat(
          branches
            .filter(branch => branch !== config.branch && branch !== defaultBranch)
            .slice(0, 5 - branchesToDisplay.length)
        );
      }
    }
    return branchesToDisplay;
  }, [branches, config, defaultBranch]);

  const branchesCount = useMemo(() => {
    if (branches && branches.length > 5) return `5/${branches.length}`;
    return null;
  }, [branches]);

  const handleBranchChange = (branch: string) => {
    router.push(`/${owner}/${repo}/${encodeURIComponent(branch)}`);
  };

  return (
    <Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full h-15 justify-start px-3">
            <img className="h-10 w-10 rounded-lg" src={`https://github.com/${owner}.png`} alt="Picture of the author" />
            <div className="text-left overflow-hidden ml-3">
              <div className="font-medium truncate">{repo}</div>
              <div className="text-xs text-muted-foreground truncate">{config?.branch}</div>
            </div>
            <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`https://github.com/${owner}/${repo}`} target="_blank" onClick={onClick} >
              <span className="mr-4">See on GitHub</span>
              <ArrowUpRight className="h-3 w-3 ml-auto min-ml-4 opacity-50" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuLabel className="w-40 text-xs text-muted-foreground font-medium">Branches{branchesCount && ` (${branchesCount})`}</DropdownMenuLabel>
            {displayBranches.length > 0 && (
              <>
                <DropdownMenuRadioGroup value={config?.branch} onValueChange={handleBranchChange}>
                  {displayBranches.map((branch: string) => (
                    <DropdownMenuRadioItem key={branch} value={branch} className="max-w-64" onClick={onClick}>
                      <span className="truncate">{branch}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator/>
              </>
            )}
          <DialogTrigger asChild>
            <DropdownMenuItem onClick={onClick}>Manage branches</DropdownMenuItem>
          </DialogTrigger>
        </DropdownMenuContent>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage branches</DialogTitle>
          </DialogHeader>
          <RepoBranches/>
        </DialogContent>
      </DropdownMenu>
    </Dialog>
  );
}