"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Ban } from "lucide-react";
import { getVisits } from "@/lib/tracker";
  
export function RepoLatest() {
  const [recentVisits, setRecentVisits] = useState<any[]>([]);

  useEffect(() => {
    // Only run in browser
    if (typeof window !== 'undefined') {
      const visits = getVisits();
      setRecentVisits(visits);
    }
  }, []);

  return (
    <>
      {recentVisits.length > 0
        ? (
          <ul>
            {recentVisits.map((visit, index) => (
              <li 
                key={index} 
                className={cn(
                  "flex gap-x-2 items-center border border-b-0 last:border-b px-3 py-2 text-sm",
                  index === 0 && "rounded-t-md",
                  index === recentVisits.length - 1 && "rounded-b-md"
                )}
              >
                <img src={`https://github.com/${visit.owner}.png`} alt={visit.owner} className="h-6 w-6 rounded" />
                <div className="font-medium truncate">{visit.repo}</div>
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