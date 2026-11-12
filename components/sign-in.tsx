"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { emailOtp, signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import { useI18n } from "@/contexts/i18n-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpVerificationForm } from "@/components/otp-verification-form";
import { toast } from "sonner";
import { Loader, Github } from "lucide-react";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [submittingMethod, setSubmittingMethod] = useState<"github" | "email" | "otp" | null>(null);
  const isSubmitting = submittingMethod !== null;
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = getSafeRedirect(redirectParam);
  const callbackURL = getAuthCallbackURL(safeRedirect);
  const errorCallbackURL = safeRedirect === "/" ? "/sign-in" : `/sign-in?redirect=${encodeURIComponent(safeRedirect)}`;

  const getErrorMessage = (value: string) => value.toLowerCase() === "unable_to_get_user_info" ? `${t("auth.githubAccessDenied")} https://github.com/settings/applications` : value;

  useEffect(() => { if (error) toast.error(getErrorMessage(error), { duration: 12000 }); }, [error]);
  useEffect(() => { const emailParam = searchParams.get("email"); if (emailParam) setEmail(emailParam.trim().toLowerCase()); }, [searchParams]);

  const handleGithubSignIn = async () => {
    setSubmittingMethod("github");
    try {
      const result = await signIn.social({ provider: "github", callbackURL, errorCallbackURL, disableRedirect: true });
      if (result.error?.message) { toast.error(result.error.message); setSubmittingMethod(null); return; }
      if (result.data?.url) { window.location.assign(result.data.url); return; }
      setSubmittingMethod(null);
      toast.error(t("auth.githubLoginFailed"));
    } catch (error: any) {
      toast.error(error?.message || t("auth.githubLoginFailed"));
      setSubmittingMethod(null);
    }
  };

  const handleEmailSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { toast.error(t("auth.invalidEmail")); return; }
    setSubmittingMethod("email");
    try {
      const result = await emailOtp.sendVerificationOtp({ email: normalizedEmail, type: "sign-in" });
      if (result.error?.message) { toast.error(result.error.message); return; }
      setEmail(normalizedEmail); setOtp(""); setStep("otp");
      toast.success(t("auth.sentCode"), { duration: 8000 });
    } finally { setSubmittingMethod(null); }
  };

  const handleOtpSignIn = async () => {
    if (otp.length !== 6) { toast.error(t("auth.enterCode")); return; }
    setSubmittingMethod("otp");
    try {
      const result = await signIn.emailOtp({ email, otp });
      if (result.error?.message) { toast.error(result.error.message); return; }
      window.location.assign(safeRedirect);
    } finally { setSubmittingMethod(null); }
  };

  const legalCopy = <p className="text-sm text-muted-foreground">{t("auth.termsIntro")}{" "}<a className="underline hover:decoration-muted-foreground/50" href="https://pagescms.org/terms" target="_blank">{t("auth.terms")}</a>{" "}{t("common.and")}{" "}<a className="underline hover:decoration-muted-foreground/50" href="https://pagescms.org/privacy" target="_blank">{t("auth.privacy")}</a>。</p>;

  return (
    <div className="min-h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full">
        {step === "otp" ? (
          <div className="space-y-6"><OtpVerificationForm busy={isSubmitting} emailLabel={email} otp={otp} pending={submittingMethod === "otp"} resendDisabled={submittingMethod === "otp"} resendPending={submittingMethod === "email"} onChange={setOtp} onResend={() => void handleEmailSignIn()} onSignInAnotherWay={() => { setStep("email"); setOtp(""); }} onSubmit={async (event) => { event.preventDefault(); await handleOtpSignIn(); }} />{legalCopy}</div>
        ) : (
          <div className="space-y-6">
            <h1 className="text-lg font-medium tracking-tight text-center">{t("auth.signInTitle")}</h1>
            <Button type="button" className="w-full" onClick={handleGithubSignIn} disabled={isSubmitting}><Github className="size-4" />{t("auth.signInWithGitHub")}{submittingMethod === "github" && <Loader className="size-4 animate-spin" />}</Button>
            <div className="relative text-center"><div className="absolute inset-0 flex items-center"><hr className="border-t w-full" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">{t("auth.or")}</span></div></div>
            <form className="space-y-2" onSubmit={async (event) => { event.preventDefault(); await handleEmailSignIn(); }}>
              <Input type="email" name="email" placeholder={t("auth.email")} required disabled={isSubmitting} value={email} onChange={(event) => setEmail(event.target.value)} />
              <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.continueWithEmail")}{submittingMethod === "email" && <Loader className="size-4 animate-spin" />}</Button>
            </form>
            {legalCopy}
          </div>
        )}
      </div>
    </div>
  );
}
