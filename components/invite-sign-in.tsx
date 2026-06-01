"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { OtpVerificationForm } from "@/components/otp-verification-form";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

type InviteState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "wrong_account" }
  | { status: "ready"; destinationPath: string }
  | {
      status: "otp_required";
      email: string;
      maskedEmail: string;
      destinationPath: string;
    };

export function InviteSignIn({ token }: { token: string }) {
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState<null | "send" | "verify" | "sign-out">(null);
  const sentOtpForInviteRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/collaborator-invites/${encodeURIComponent(token)}`);
        const next = (await response.json()) as InviteState;
        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) setState({ status: "unavailable" });
      }
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state.status === "ready") {
      window.location.assign(state.destinationPath);
    }
  }, [state]);

  useEffect(() => {
    if (state.status !== "otp_required" || sentOtpForInviteRef.current === token) {
      return;
    }

    sentOtpForInviteRef.current = token;
    void sendOtp(state.email);
  }, [state, token]);

  async function sendOtp(email: string) {
    setPending("send");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });

      if (result.error?.message) {
        toast.error(result.error.message);
      }
    } catch {
      toast.error("Unable to send sign-in code.");
    } finally {
      setPending(null);
    }
  }

  async function verifyOtp() {
    if (state.status !== "otp_required") return;
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }

    setPending("verify");
    try {
      const result = await authClient.signIn.emailOtp({
        email: state.email,
        otp,
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        setPending(null);
        return;
      }

      const claimResponse = await fetch(`/api/collaborator-invites/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const claim = (await claimResponse.json()) as InviteState;
      if (claim.status === "ready") {
        window.location.assign(claim.destinationPath);
        return;
      }

      if (claimResponse.status === 404 && claim.status === "unavailable") {
        window.location.assign(state.destinationPath);
        return;
      }

      toast.error("Unable to claim this invitation.");
      setPending(null);
    } catch {
      toast.error("Unable to verify code.");
      setPending(null);
    }
  }

  const shellClassName = "absolute inset-0 border-0 rounded-none";

  if (state.status === "loading" || state.status === "ready") {
    return (
      <Empty className={shellClassName}>
        <Loader className="size-5 animate-spin text-muted-foreground" />
      </Empty>
    );
  }

  if (state.status === "unavailable") {
    return (
      <Empty className={shellClassName}>
        <EmptyHeader>
          <EmptyTitle>Invite unavailable</EmptyTitle>
          <EmptyDescription>This invitation is no longer available.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/sign-in" className={buttonVariants()}>
            Sign in
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (state.status === "wrong_account") {
    return (
      <Empty className={shellClassName}>
        <EmptyHeader>
          <EmptyTitle>Wrong account</EmptyTitle>
          <EmptyDescription>This invitation was sent to another account.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            disabled={pending !== null}
            onClick={async () => {
              setPending("sign-out");
              try {
                await authClient.signOut();
                window.location.reload();
              } finally {
                setPending(null);
              }
            }}
          >
            Sign out
            {pending === "sign-out" && <Loader className="size-4 animate-spin" />}
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go home
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty className={shellClassName}>
      <EmptyContent>
        <div className="w-full max-w-[340px]">
          <OtpVerificationForm
            busy={pending !== null}
            emailLabel={state.maskedEmail}
            otp={otp}
            pending={pending === "verify"}
            resendDisabled={pending === "verify"}
            resendPending={pending === "send"}
            onChange={setOtp}
            onResend={() => void sendOtp(state.email)}
            onSignInAnotherWay={() => {
              window.location.assign(`/sign-in?redirect=${encodeURIComponent(`/sign-in/collaborator?token=${token}`)}`);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void verifyOtp();
            }}
          />
        </div>
      </EmptyContent>
    </Empty>
  );
}
