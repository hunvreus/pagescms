"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Ban } from "lucide-react";
import { getVisits } from "@/lib/tracker";
import { Skeleton } from "@/components/ui/skeleton";
  
export function RepoLatest() {
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const displayedVisits = recentVisits.slice(0, 3);

  useEffect(() => {
    // Only run in browser
    if (typeof window !== 'undefined') {
      const visits = getVisits();
      setRecentVisits(visits);
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <ul>
        {[...Array(3)].map((_, index) => (
          <li
            key={index}
            className={cn(
              "flex gap-x-2 items-center border border-b-0 last:border-b px-3 py-2 text-sm",
              index === 0 && "rounded-t-md",
              index === 2 && "rounded-b-md",
            )}
          >
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-5 w-20 rounded ml-auto" />
            <Skeleton className="h-6 w-12 rounded" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {displayedVisits.length > 0
        ? (
          <ul>
            {displayedVisits.map((visit, index) => (
              <li 
                key={index} 
                className={cn(
                  "flex gap-x-2 items-center border border-b-0 last:border-b px-3 py-2 text-sm",
                  index === 0 && "rounded-t-md",
                  index === displayedVisits.length - 1 && "rounded-b-md"
                )}
              >
                <img src={`https://github.com/${visit.owner}.png`} alt={visit.owner} className="h-6 w-6 rounded" />
                <Link
                  className="truncate font-medium hover:underline"
                  href={`/${visit.owner}/${visit.repo}/${encodeURIComponent(visit.branch)}`}
                >{visit.repo}</Link>
                <div className="text-muted-foreground truncate">{formatDistanceToNow(new Date(visit.timestamp * 1000))} ago</div>
                <Link
                  className={cn("ml-auto", buttonVariants({ variant: "outline", size: "xs"}))}
                  href={`/${visit.owner}/${visit.repo}/${encodeURIComponent(visit.branch)}`}
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )
        : <div className="text-sm text-muted-foreground h-[50px] px-6 flex justify-center items-center bg-accent rounded-md">
            <Ban className="h-4 w-4 mr-2"/>
            No recent visits.
          </div>
      }
    </>
  );
}
