"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useUser } from "@/contexts/user-context";
import { handleAppInstall } from "@/lib/actions/app";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban, ChevronsUpDown, LockKeyhole, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function RepoSelect({
  onAccountSelect
}: {
  onAccountSelect?: (account: any) => void
}) {
  const { user } = useUser();

  const accounts = useMemo(() => {
    if (!user) return [];
    return user.accounts || [];
  }, [user]);

  const [selectedAccount, setSelectedAccount] = useState(accounts[0]);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(
    selectedAccount?.repositorySelection === "all" ? keyword : "",
    500
  );
  const [results, setResults] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const searchResults = useMemo(() => {
    if (!results) return [];
    if (selectedAccount?.repositorySelection !== "all") {
      return results.filter((result: any) => result.repo.toLowerCase().includes(keyword.toLowerCase()));
    }
    return results;
  }, [results, keyword, selectedAccount]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!selectedAccount) return;
  
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
  
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          type: selectedAccount.type,
          keyword: debouncedKeyword,
          repository_selection: selectedAccount.repositorySelection
        });
  
        const response = await fetch(
          `/api/repos/${selectedAccount.login}?${params.toString()}`,
          { signal: abortControllerRef.current.signal }
        );
        if (!response.ok) throw new Error(`Failed to fetch repos: ${response.status} ${response.statusText}`);
  
        const data = await response.json();
  
        if (data.status !== "success") throw new Error(data.message);
  
        setResults(data.data);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error(error);
          setResults([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [debouncedKeyword, selectedAccount]);

  const resultsLoadingSkeleton = useMemo(() => (
    <ul>
      {[...Array(5)].map((_, index) => (
        <li key={index} className="flex gap-x-2 items-center border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm">
          <Skeleton className="h-5 w-24 text-left rounded" />
          <Skeleton className="h-5 w-24 text-left rounded" />
          <Button variant="outline" size="xs" className="ml-auto" disabled>
            Open
          </Button>
        </li>
      ))}
    </ul>
  ), []);

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex w-full max-w items-center gap-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="px-3">
              <img className="h-6 w-6 rounded mr-2" src={`https://github.com/${selectedAccount?.login}.png`} alt={`${selectedAccount?.login}'s avatar`}/>
              <span className="mr-2">{selectedAccount?.login}</span>
              <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50"/>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {accounts.map((account: any) => (
              <DropdownMenuItem
                key={account.login}
                onSelect={() => {
                  setSelectedAccount(account);
                  if (onAccountSelect) onAccountSelect(account);
                }}
              >
                <img className="h-6 w-6 rounded mr-2" src={`https://github.com/${account.login}.png`} alt={`${account.login}'s avatar`}/>
                {account.login}
              </DropdownMenuItem>
            ))}
            {user?.githubId &&
              <>
                <DropdownMenuSeparator/>
                <DropdownMenuItem onClick={() => handleAppInstall()}>Add a GitHub account</DropdownMenuItem>
              </>
            }
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="relative flex-1"> 
          <Input
            placeholder="Search repositories by name"
            className="pl-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none"/>
        </div>
      </div>
      {isLoading || results === null
        ? resultsLoadingSkeleton
        : searchResults.length > 0
          ? <ul>
              {searchResults.map((result: any) => (
                <li key={`${result.owner}/${result.repo}`} className="flex gap-x-2 items-center border border-b-0 last:border-b first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm">
                  <div className="truncate font-medium">{result.repo}</div>
                  {result.private && <LockKeyhole className="h-3 w-3 opacity-50"/>}
                  {result.updatedAt &&
                    <div className="text-muted-foreground truncate">{formatDistanceToNow(new Date(result.updatedAt))} ago</div>
                  }
                  <Link
                    className={cn("ml-auto", buttonVariants({ variant: "outline", size: "xs"}))}
                    href={`/${result.owner}/${result.repo}/${result.defaultBranch ? encodeURIComponent(result.defaultBranch) : ""}`}
                    prefetch={true}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          : <div className="text-sm text-muted-foreground h-[50px] px-6 flex justify-center items-center bg-accent rounded-md">
              <Ban className="h-4 w-4 mr-2"/>
              No projects found
            </div>
      }
    </div>
  );
}