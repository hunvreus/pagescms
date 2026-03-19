"use client";

import { useEffect } from "react";
import { signOut } from "@/lib/auth-client";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

const GithubAuthExpired = () => {
  useEffect(() => {
    let cancelled = false;

    const invalidateSession = async () => {
      try {
        await signOut();
      } finally {
        if (!cancelled) window.location.assign("/sign-in");
      }
    };

    invalidateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>GitHub session expired</EmptyTitle>
        <EmptyDescription>Your GitHub access is no longer valid. Signing you out now.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};

export { GithubAuthExpired };
