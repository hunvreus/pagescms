"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  EllipsisVertical,
  Github,
  Loader,
  Mail,
} from "lucide-react";

type IdentitiesProps = {
  email: string;
  githubConnected: boolean;
  githubUsername?: string | null;
  githubManageUrl?: string | null;
};

export function Identities({
  email,
  githubConnected,
  githubUsername,
  githubManageUrl,
}: IdentitiesProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "connect" | "disconnect" | null
  >(null);

  const handleConnectGithub = async () => {
    setPendingAction("connect");
    try {
      const result = await signIn.social({
        provider: "github",
        callbackURL: "/settings",
        errorCallbackURL: "/settings",
      });
      if (result.error?.message) toast.error(result.error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDisconnectGithub = async () => {
    setPendingAction("disconnect");
    try {
      const response = await fetch("/api/auth/unlink-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "github" }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.status) {
        const message =
          payload?.message || "Failed to disconnect GitHub account.";
        throw new Error(message);
      }

      toast.success("GitHub account disconnected.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to disconnect GitHub account.";
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <ul>
      <li className="flex items-center gap-x-3 border border-b-0 first:rounded-t-md px-3 py-2 text-sm">
        <div className="flex items-center gap-x-2">
          <Mail className="h-4 w-4" />
          <span className="font-medium">Email</span>
        </div>
        <div className="ml-2 truncate text-muted-foreground">{email}</div>
      </li>
      <li className="flex items-center gap-x-3 border first:rounded-t-md last:rounded-b-md px-3 py-2 text-sm">
        <div
          className={cn(
            "flex items-center gap-x-2",
            !githubConnected && "text-muted-foreground",
          )}
        >
          <Github className="h-4 w-4" />
          <span className="font-medium">GitHub</span>
        </div>
        {githubConnected && (
          <div className="ml-2 truncate text-muted-foreground">
            {githubUsername ? `@${githubUsername}` : "Connected"}
          </div>
        )}
        {!githubConnected ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8"
            onClick={handleConnectGithub}
            disabled={pendingAction !== null}
          >
            Connect
            {pendingAction === "connect" && (
              <Loader className="h-4 w-4 animate-spin" />
            )}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-xs"
                variant="outline"
                className="ml-auto"
                disabled={pendingAction !== null}
              >
                {pendingAction === "disconnect" ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <EllipsisVertical className="h-4 w-4" />
                )}
                <span className="sr-only">GitHub actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {githubManageUrl && (
                <>
                  <DropdownMenuItem asChild>
                    <a href={githubManageUrl} target="_blank" rel="noreferrer">
                      Manage on GitHub
                      <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDisconnectGithub}
                disabled={pendingAction !== null}
              >
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    </ul>
  );
}
