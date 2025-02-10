"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRepo } from "@/contexts/repo-context";
import { useConfig } from "@/contexts/config-context";
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils";
import { Check, Loader } from "lucide-react";

export function RepoBranches() {
  const { owner, repo, branches, setBranches } = useRepo();
  const { config } = useConfig();

  const [search, setSearch] = useState("");
  const [filteredBranches, setFilteredBranches] = useState<string[] | undefined>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFilteredBranches(
      branches?.filter((branch) =>
        branch.toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [search, branches]);

  const isValidBranchName = useCallback((name: string) => {
    if (!name || name.length > 255) return false;
    const validBranchRegex = /^(?!\/|.*(?:\/\.|\/\/|\.\.|@{|\\))[^\x20\x7f ~^:?*\[\]]+(?<!\.|\/)$/;
    return validBranchRegex.test(name);
  }, []);

  const handleCreateBranch = async () => {
    if (config) {
      // TODO: do we ask the user to confirm?
      if (search || isValidBranchName(search)) {
        setIsSubmitting(true);
        try {
          const newBranch = search;

          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newBranch
            }),
          });
          if (!response.ok) throw new Error(`Failed to create branch: ${response.status} ${response.statusText}`);
          
          const data: any = await response.json();
      
          if (data.status !== "success") throw new Error(data.message);

          if (branches) {
            setBranches([...branches, newBranch]);
          } else {
            setBranches([newBranch]);
          }
        } catch (error) {
          console.error("Error creating branch:", error);
          // TODO: display an error?
        } finally {
          setIsSubmitting(false);
        }
      }
    }
  };

  if (!branches || branches.length === 0) {
    return <div className="text-muted-foreground p-4">No branches.</div>;
  }

  return (
    <div className="flex flex-col gap-y-2">
      <header className="flex gap-x-2">
        <Input
          placeholder="Search branches by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          disabled={!search || !isValidBranchName(search) || branches.includes(search) || isSubmitting}
          onClick={handleCreateBranch}>
          Create
          {isSubmitting && (<Loader className="ml-2 h-4 w-4 animate-spin" />)}
        </Button>
      </header>
      <main className="flex flex-col gap-y-1 overflow-auto max-h-[calc(100vh-9rem)] scrollbar">
        {filteredBranches && filteredBranches.length > 0
          ? filteredBranches.map(branch => (
            <Link
              key={branch}
              className={cn(
                branch === config?.branch
                  ? "bg-accent cursor-default"
                  : "hover:bg-accent",
                "inline-flex items-center rounded-lg px-3 py-2 transition-all ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              href={`/${owner}/${repo}/${encodeURIComponent(branch)}`}
            >
              <span className="truncate">{branch}</span>
              {branch === config?.branch && <Check className="h-4 w-4 ml-auto opacity-50" />}
            </Link>
          ))
          : <div className="text-muted-foreground py-6 text-center">No branches found.</div>
        }
      </main>
    </div>
  )
}