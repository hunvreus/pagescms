"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import{ Github } from "lucide-react";

export function SignIn() {
  const emailInputRef = useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    const email = searchParams.get("email");
    if (email && emailInputRef.current) emailInputRef.current.value = email;
  }, [searchParams]);

  const getNameFromEmail = (email: string) => {
    const localPart = email.split("@")[0]?.trim();
    return localPart || email;
  };

  const handleGithubSignIn = async () => {
    const result = await signIn.social({
      provider: "github",
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
    });
    if (result.error?.message) toast.error(result.error.message);
  };

  const handleEmailSignIn = async (formData: FormData) => {
    const emailValue = formData.get("email");
    if (typeof emailValue !== "string" || !emailValue) {
      toast.error("Invalid email");
      return;
    }

    const result = await signIn.magicLink({
      email: emailValue,
      name: getNameFromEmail(emailValue),
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
    });

    if (result.error?.message) {
      toast.error(result.error.message);
      return;
    }

    toast.success("We've sent you a link to sign in. If you don't see it, check your spam folder.", {
      duration: 10000,
    });
    if (emailInputRef.current) emailInputRef.current.value = "";
  };

  return (
    <div className="h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full space-y-6">
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-center">Sign in to Pages CMS</h1>
        <Button type="button" className="w-full" onClick={handleGithubSignIn}>
            <Github className="h-4 w-4 mr-2" />
            Sign in with GitHub
        </Button>
        <div className="relative text-center">
          <div className="absolute inset-0 flex items-center">
            <hr className="border-t w-full"/>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            await handleEmailSignIn(formData);
          }}
        >
          <Input ref={emailInputRef} type="email" name="email" placeholder="Email" required/>
          <Button type="submit" className="w-full">
            Sign in with email
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">By clicking continue, you agree to our <a className="underline hover:decoration-muted-foreground/50" href="https://pagescms.org/terms" target="_blank">Terms of Service</a> and <a className="underline hover:decoration-muted-foreground/50" href="https://pagescms.org/privacy" target="_blank">Privacy Policy</a>.</p>
      </div>
    </div>
  );
}
