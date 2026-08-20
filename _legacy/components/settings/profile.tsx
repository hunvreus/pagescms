"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getInitialsFromName } from "@/lib/utils/avatar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "lucide-react";

type ProfileProps = {
  name?: string | null;
  email: string;
  githubUsername?: string | null;
};

export function Profile({ name, email, githubUsername }: ProfileProps) {
  const router = useRouter();
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
      const response = await fetch("/api/auth/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.status) {
        throw new Error(payload?.message || "Failed to update profile.");
      }

      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Manage the information displayed to other users.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="w-full"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="grid w-full items-center gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <div className="col-span-3">
                <Input
                  id="name"
                  name="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="picture" className="text-right">
                Picture
              </Label>
              <div className="col-span-3">
                <Avatar className="h-24 w-24 rounded-md">
                  <AvatarImage
                    src={
                      githubUsername
                        ? `https://github.com/${githubUsername}.png`
                        : `https://unavatar.io/${email}?fallback=false`
                    }
                    alt={avatarLabel}
                  />
                  <AvatarFallback className="rounded-md">
                    {getInitialsFromName(avatarLabel)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          Save profile
          {isSaving && <Loader className="ml-2 h-4 w-4 animate-spin" />}
        </Button>
      </CardFooter>
    </Card>
  );
}
