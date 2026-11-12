"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { useI18n } from "@/contexts/i18n-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "lucide-react";

type ProfileProps = { name?: string | null; email: string; githubUsername?: string | null };

export function Profile({ name, email, githubUsername }: ProfileProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(name?.trim() || "");
  const [isSaving, setIsSaving] = useState(false);
  const initialName = name?.trim() || "";
  const canSave = displayName.trim().length > 0 && displayName.trim() !== initialName && !isSaving;
  const avatarLabel = displayName.trim() || email;
  const handleSave = async () => {
    const nextName = displayName.trim();
    if (!nextName) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/auth/update-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.status) throw new Error(payload?.message || t("settings.profileUpdateFailed"));
      toast.success(t("settings.profileUpdated"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.profileUpdateFailed"));
    } finally { setIsSaving(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.profile")}</CardTitle><CardDescription>{t("settings.profileDescription")}</CardDescription></CardHeader>
      <CardContent><form className="w-full" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}><div className="grid w-full items-center gap-4">
        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="name" className="text-right">{t("settings.name")}</Label><div className="col-span-3"><Input id="name" name="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} disabled={isSaving} /></div></div>
        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="picture" className="text-right">{t("settings.picture")}</Label><div className="col-span-3"><Avatar className="h-24 w-24 rounded-md"><AvatarImage src={githubUsername ? `https://github.com/${githubUsername}.png` : `https://unavatar.io/${email}?fallback=false`} alt={avatarLabel} /><AvatarFallback className="rounded-md">{getInitialsFromName(avatarLabel)}</AvatarFallback></Avatar></div></div>
      </div></form></CardContent>
      <CardFooter><Button size="sm" className="ml-auto" onClick={() => void handleSave()} disabled={!canSave}>{t("settings.saveProfile")}{isSaving && <Loader className="ml-2 h-4 w-4 animate-spin" />}</Button></CardFooter>
    </Card>
  );
}
