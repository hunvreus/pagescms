"use client";

import { useState, useEffect } from "react";
import { signIn, signOut } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Loader } from "lucide-react";
import { toast } from "sonner";

export function SignInFromInvite({
  githubUsername,
  signedInEmail,
  email,
  redirectTo,
  verifyUrl,
}: {
  githubUsername?: string;
  signedInEmail?: string;
  email?: string;
  redirectTo?: string;
  verifyUrl?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const normalizedInviteEmail = email?.trim().toLowerCase();
  const normalizedSignedInEmail = signedInEmail?.trim().toLowerCase();
  const isSignedIn = Boolean(signedInEmail);
  const isEmailMismatch = Boolean(
    normalizedInviteEmail &&
      normalizedSignedInEmail &&
      normalizedInviteEmail !== normalizedSignedInEmail,
  );

  const getNameFromEmail = (value: string) => {
    const localPart = value.split("@")[0]?.trim();
    return localPart || value;
  };

  useEffect(() => {
    if (verifyUrl && !isSignedIn) {
      const timer = setTimeout(() => {
        window.location.assign(verifyUrl);
      }, 300);
      return () => clearTimeout(timer);
    }

    if (!verifyUrl && !githubUsername) {
      const timer = setTimeout(() => {
        void handleSignIn();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [githubUsername, isSignedIn, verifyUrl]);

  const handleContinueWithInvite = async () => {
    if (!verifyUrl) return;
    setIsLoading(true);
    try {
      window.location.assign(verifyUrl);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      if (!email) throw new Error("Invite email not found");
      const result = await signIn.magicLink({
        email: email as string,
        name: getNameFromEmail(email as string),
        callbackURL: redirectTo || "/",
        errorCallbackURL: "/sign-in",
      });
      if (result.error?.message) throw new Error(result.error.message);
      toast.success("We sent you a sign-in link. Check your inbox (and spam folder).", {
        duration: 10000,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full space-y-6">
        {verifyUrl ? (
          isSignedIn ? (
            <>
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-center">
                Continue with invite?
              </h1>
              <p className="text-sm text-muted-foreground">
                You are currently signed in as <strong>{signedInEmail}</strong>.
                {isEmailMismatch
                  ? ` This invite is for ${email}.`
                  : ` This invite matches your current account (${email}).`}
              </p>
              <footer className="flex flex-col gap-y-2">
                {isEmailMismatch ? (
                  <Button
                    variant="default"
                    onClick={async () => {
                      setIsLoading(true);
                      try {
                        await signOut();
                        window.location.assign(verifyUrl);
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    disabled={isLoading}
                  >
                    Sign out and continue
                    {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
                  </Button>
                ) : (
                  <Button variant="default" onClick={handleContinueWithInvite} disabled={isLoading}>
                    Continue
                    {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
                  </Button>
                )}
                {redirectTo && (
                  <Link href={redirectTo} className={buttonVariants({ variant: "outline" })}>
                    <span className="truncate">Go to &quot;{redirectTo}&quot;</span>
                  </Link>
                )}
              </footer>
            </>
          ) : (
            <>
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-center">Sign in as a collaborator?</h1>
              <p className="text-sm text-muted-foreground">
                Please confirm that you want to continue with {email}.
              </p>
              <footer className="flex flex-col gap-y-2">
                <Button variant="default" onClick={handleContinueWithInvite} disabled={isLoading}>
                  Continue
                  {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </footer>
            </>
          )
        ) : githubUsername ? (
          <>
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
                  window.location.reload();
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
        ) : (
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
        )}
      </div>
    </div>
  );
}
