"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRepo } from "@/contexts/repo-context";
import { useUser } from "@/contexts/user-context";

export default function Page() {
  const { owner, repo, defaultBranch } = useRepo();
  const router = useRouter();
  const { user } = useUser();
	
	if (!user) throw new Error("User not found");
	if (!user.accounts) throw new Error("Accounts not found");
  if (!user.accounts.find((account) => account.login.toLowerCase() === owner.toLowerCase())) throw new Error(`GitHub application not installed for "${owner}"`);

  useEffect(() => {
    // If no branch is provided, redirect to the default branch
    router.replace(`/${owner}/${repo}/${encodeURIComponent(defaultBranch as string)}`);
  }, [owner, repo, defaultBranch, router]);
  
  return null;
};