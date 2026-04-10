"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut } from "@/lib/auth-client";
import { getAuthCallbackURL } from "@/lib/auth-redirect";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
  const hasAutoContinuedRef = useRef(false);

  const normalizedInviteEmail = email?.trim().toLowerCase();
  const normalizedSignedInEmail = signedInEmail?.trim().toLowerCase();
  const isSignedIn = Boolean(signedInEmail);
  const isEmailMismatch = Boolean(
    normalizedInviteEmail &&
    normalizedSignedInEmail &&
    normalizedInviteEmail !== normalizedSignedInEmail,
  );

  useEffect(() => {
    if (
      !verifyUrl ||
      !isSignedIn ||
      isEmailMismatch ||
      hasAutoContinuedRef.current
    ) {
      return;
    }

    hasAutoContinuedRef.current = true;
    setIsLoading(true);
    window.location.assign(verifyUrl);
  }, [isEmailMismatch, isSignedIn, verifyUrl]);

  const getNameFromEmail = (value: string) => {
    const localPart = value.split("@")[0]?.trim();
    return localPart || value;
  };

  const handleContinueWithInvite = async () => {
    if (!verifyUrl || isLoading) return;
    setIsLoading(true);
    try {
      window.location.assign(verifyUrl);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (!email) throw new Error("Invite email not found");
      const result = await signIn.magicLink({
        email: email as string,
        name: getNameFromEmail(email as string),
        callbackURL: getAuthCallbackURL(redirectTo),
        errorCallbackURL: "/sign-in",
      });
      if (result.error?.message) throw new Error(result.error.message);
      toast.success(
        "We sent you a sign-in link. Check your inbox (and spam folder).",
        {
          duration: 10000,
        },
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const shellClassName = "absolute inset-0 border-0 rounded-none";

  return (
    <Empty className={shellClassName}>
      <EmptyHeader>
        {verifyUrl ? (
          isSignedIn ? (
            <>
              <EmptyTitle>{isEmailMismatch ? "Wrong account" : "Continue with invite"}</EmptyTitle>
              <EmptyDescription>
                You&apos;re signed in as {signedInEmail},
                {isEmailMismatch ? (
                  <> but this invitation is for {email}.</>
                ) : (
                  <> and this invitation matches your current account.</>
                )}
              </EmptyDescription>
              <EmptyContent>
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
                    {email ? `Continue as ${email}` : "Continue"}
                    {isLoading && (
                      <Loader className="ml-2 h-4 w-4 animate-spin" />
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={handleContinueWithInvite}
                    disabled={isLoading}
                  >
                    Continue
                    {isLoading && (
                      <Loader className="ml-2 h-4 w-4 animate-spin" />
                    )}
                  </Button>
                )}
                {redirectTo && (
                  <Link
                    href={redirectTo}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <span className="truncate">
                      Open &quot;{redirectTo}&quot;
                    </span>
                  </Link>
                )}
              </EmptyContent>
            </>
          ) : (
            <>
              <EmptyTitle>Continue with invite</EmptyTitle>
              <EmptyDescription>
                Continue as {email} to open this invitation.
              </EmptyDescription>
              <EmptyContent>
                <Button
                  variant="default"
                  onClick={handleContinueWithInvite}
                  disabled={isLoading}
                >
                  Continue
                  {isLoading && (
                    <Loader className="ml-2 h-4 w-4 animate-spin" />
                  )}
                </Button>
              </EmptyContent>
            </>
          )
        ) : githubUsername ? (
          <>
            <EmptyTitle>Switch account</EmptyTitle>
            <EmptyDescription>
              You&apos;re signed in with GitHub as @{githubUsername}.
              {redirectTo
                ? ` Sign out and continue as ${email}, or open "${redirectTo}" with your current GitHub account.`
                : ` Sign out and continue as ${email}.`}
            </EmptyDescription>
            <EmptyContent>
              <Button
                variant="default"
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await signOut();
                    window.location.reload();
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
              >
                Continue as collaborator
                {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
              {redirectTo && (
                <Link
                  href={redirectTo}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <span className="truncate">
                    Open &quot;{redirectTo}&quot;
                  </span>
                </Link>
              )}
            </EmptyContent>
          </>
        ) : (
          <>
            <EmptyTitle>Sign in to continue</EmptyTitle>
            <EmptyDescription>
              Send a sign-in link to {email} to continue with this invitation.
            </EmptyDescription>
            <EmptyContent>
              <Button
                variant="default"
                onClick={handleSignIn}
                disabled={isLoading}
              >
                Send sign-in link
                {isLoading && <Loader className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </EmptyContent>
          </>
        )}
      </EmptyHeader>
    </Empty>
  );
}
