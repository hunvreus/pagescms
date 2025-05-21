"use client";

import { useEffect } from "react";
import { Message  } from "@/components/message";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error);
  }, [error])
 
  return (
    <Message
      title="Something's wrong"
      description={error.message}
      className="absolute inset-0"
    >
      <Link className={buttonVariants({ variant: "default" })} href="/">Go to home</Link>
    </Message>
  );
}