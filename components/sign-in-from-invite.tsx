"use client";

import { useState, useEffect } from "react";
import { signIn, signOut } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Loader } from "lucide-react";

export function SignInFromInvite({
  githubUsername,
  email,
  redirectTo
}: {
  githubUsername?: string;
  email?: string;
  redirectTo?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const getNameFromEmail = (value: string) => {
    const localPart = value.split("@")[0]?.trim();
    return localPart || value;
  };

  useEffect(() => {
    if (!githubUsername) {
      const timer = setTimeout(() => {
        void handleSignIn();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [githubUsername]);

  const handleSignIn = async () => {
    if (!email) throw new Error("Invite email not found");
    setIsLoading(true);
    try {
      const result = await signIn.magicLink({
        email: email as string,
        name: getNameFromEmail(email as string),
        callbackURL: redirectTo || "/",
        errorCallbackURL: "/sign-in",
      });
      if (result.error?.message) throw new Error(result.error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full space-y-6">
        {githubUsername
          ? <>
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-center">Sign out from your GitHub account?</h1>
              <p className="text-sm text-muted-foreground">
                You are already signed in with your GitHub account (@{githubUsername}). 
                {redirectTo
                  ? ` Do you want to sign out from your GitHub account and sign in as a collaborator with ${email} or try to access "${redirectTo}" with your GitHub account?`
                  : ` Do you want to sign out from your GitHub account and sign in as a collaborator with ${email}?`
                }
              </p>
              <footer className="flex flex-col gap-y-2">
                <Button variant="default" onClick={async () => {
                  setIsLoading(true);
                  try {
                    await signOut();
                    await handleSignIn();
                  } finally {
                    setIsLoading(false);
                  }
                }} disabled={isLoading}>
                  Sign in as collaborator
                  {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
                {redirectTo && (
                  <Link href={redirectTo} className={buttonVariants({ variant: "outline" })}><span className="truncate">Go to &quot;{redirectTo}&quot;</span></Link>
                )}
              </footer>
            </>
          :
            <>
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-center">Sign in as a collaborator?</h1>
              <p className="text-sm text-muted-foreground">
                Please confirm that you want to sign in with {email}.
              </p>
              <footer className="flex flex-col gap-y-2">
                <Button variant="default" onClick={handleSignIn} disabled={isLoading}>
                  Sign in
                  {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </footer>
            </>
        }
      </div>
    </div>
  );
}
