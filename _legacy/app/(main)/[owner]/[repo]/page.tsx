"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRepo } from "@/contexts/repo-context";

export default function Page() {
  const { owner, repo, defaultBranch } = useRepo();
  const router = useRouter();

  useEffect(() => {
    // If no branch is provided, redirect to the default branch
    router.replace(`/${owner}/${repo}/${encodeURIComponent(defaultBranch as string)}`);
  }, [owner, repo, defaultBranch, router]);
  
  return null;
};
