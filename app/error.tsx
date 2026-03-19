"use client";

import { useEffect } from "react";
import { Message } from "@/components/message";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { GithubAuthExpired } from "@/components/github-auth-expired";
import { isGithubAuthError } from "@/lib/github-auth";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  if (isGithubAuthError(error)) {
    return <GithubAuthExpired />;
  }

  return (
    <Message
      title="Something's wrong"
      description={error.message}
      className="absolute inset-0"
    >
      <Link className={buttonVariants({ variant: "default" })} href="/">
        Go home
      </Link>
      <button className={buttonVariants({ variant: "outline" })} onClick={reset}>
        Try again
      </button>
    </Message>
  );
}
