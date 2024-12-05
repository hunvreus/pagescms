"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Ban } from "lucide-react";
  
export function RepoLatest() {
  const [latestVisit, setLatestVisit] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLatestVisit = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/tracker`);
        if (!response.ok) throw new Error(`Failed to fetch latest visit: ${response.status} ${response.statusText}`);
  
        const data: any = await response.json();
  
        if (data.status !== "success") throw new Error(data.message);
  
        setLatestVisit(data.data);
      } catch (error: any) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchLatestVisit();
  }, []);

  if (isLoading) {
    return (
      <div className="flex gap-x-2 items-center border rounded-md px-3 py-2 text-sm">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-5 w-24 text-left rounded" />
        <Skeleton className="h-5 w-24 text-left rounded" />
        <Button variant="outline" size="xs" className="ml-auto" disabled>
          Open
        </Button>
      </div>
    );
  }

  return (
    <>
      {latestVisit
        ? <div className="flex gap-x-2 items-center border rounded-md px-3 py-2 text-sm">
            <img src={`https://github.com/${latestVisit.owner}.png`} alt={latestVisit.owner} className="h-6 w-6 rounded" />
            <div className="font-medium truncate">{latestVisit.repo}</div>
            <div className="text-muted-foreground truncate">{formatDistanceToNow(new Date(latestVisit.lastVisited! * 1000))} ago</div>
            <Link
              className={cn("ml-auto", buttonVariants({ variant: "outline", size: "xs"}))}
              href={`/${latestVisit.owner}/${latestVisit.repo}/${encodeURIComponent(latestVisit.branch)}`}
            >
              Open
            </Link>
          </div>
        : <div className="text-sm text-muted-foreground h-[50px] px-6 flex justify-center items-center bg-accent rounded-md">
            <Ban className="h-4 w-4 mr-2"/>
            No recent visits.
          </div>
      }
    </>
  );
};