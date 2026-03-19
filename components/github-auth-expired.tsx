"use client";

import { useEffect } from "react";
import { Message } from "@/components/message";
import { signOut } from "@/lib/auth-client";

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
    <Message
      title="GitHub session expired"
      description="Your GitHub access is no longer valid. Signing you out now."
      className="absolute inset-0"
    />
  );
};

export { GithubAuthExpired };
