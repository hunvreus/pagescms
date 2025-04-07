"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { useSearchParams } from "next/navigation";
import { handleEmailSignIn, handleGithubSignIn } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import{ Github } from "lucide-react";

export function SignIn() {
  const [emailSignInState, emailSignInAction] = useFormState(handleEmailSignIn, { message: ""});
  const emailInputRef = useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (emailSignInState?.message) {
      toast.success(emailSignInState.message, { duration: 10000});
      if (emailInputRef.current) emailInputRef.current.value = "";
    }
  }, [emailSignInState]);

  return (
    <div className="h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full space-y-6">
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-center">Sign in to Pages CMS</h1>
        <form action={handleGithubSignIn}>
          <SubmitButton type="submit" className="w-full">
            <Github className="h-4 w-4 mr-2" />
            Sign in with GitHub
          </SubmitButton>
        </form>
        <div className="relative text-center">
          <div className="absolute inset-0 flex items-center">
            <hr className="border-t w-full"/>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>
        <form action={emailSignInAction} className="space-y-2">
          <Input ref={emailInputRef} type="email" name="email" placeholder="Email" required/>
          {emailSignInState?.error &&
            <div className="text-sm font-medium text-red-500">{emailSignInState.error}</div>
          }
          <SubmitButton type="submit" className="w-full">
            Sign in with email
          </SubmitButton>
        </form>
        <p className="text-sm text-muted-foreground">By clicking continue, you agree to our <a className="underline hover:decoration-muted-foreground/50" href="https://pagescms.org/terms" target="_blank">Terms of Service</a> and <a className="underline hover:decoration-muted-foreground/50" href="https://pagescms.org/privacy" target="_blank">Privacy Policy</a>.</p>
      </div>
    </div>
  );
}