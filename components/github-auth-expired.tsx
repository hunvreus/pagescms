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
        if (!cancelled) {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          const signInUrl =
            returnTo && returnTo !== "/sign-in"
              ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
              : "/sign-in";
          window.location.assign(signInUrl);
        }
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
        <EmptyDescription>Your GitHub session has expired. You&apos;ll need to sign in again.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};

export { GithubAuthExpired };
