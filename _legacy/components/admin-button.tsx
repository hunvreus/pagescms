"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";

export function AdminButton() {
  const { user } = useUser();

  if (!user?.isAdmin) return null;

  return (
    <Button asChild variant="ghost" size="icon-sm" className="rounded-full">
      <Link href="/admin" aria-label="Admin panel">
        <Settings className="size-4" />
      </Link>
    </Button>
  );
}
