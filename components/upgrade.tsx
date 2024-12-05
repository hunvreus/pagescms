"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { handleCheckout } from "@/lib/actions/subscription";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CircleCheck, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Upgrade({
  owner,
  children
}: {
  owner: string;
  children: React.ReactNode;
}) {
  const [billingPeriod, setBillingPeriod] = useState("yearly");
  const pathname = usePathname();
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Upgrade &quot;{owner}&quot; to Pro</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <header className="grid grid-cols-2 w-full gap-2">
            <label
              className={cn(
                "rounded-md cursor-pointer p-4 relative hover:bg-accent",
                billingPeriod === "yearly" ? "ring-2 ring-primary" : ""
              )}
            >
              {billingPeriod === "yearly" &&
                <div className="text-primary-foreground bg-primary p-0.5 rounded-full absolute top-2 right-2">
                  <Check className="stroke-[3] w-3 h-3"/>
                </div>
              }
              <div className="text-xs mb-1">Pay yearly</div>
              <div><span className="text-lg md:text-2xl font-semibold">$49</span>/month</div>
              <input
                type="radio"
                value="yearly"
                checked={billingPeriod === "yearly"} 
                onChange={() => setBillingPeriod("yearly")}
                className="sr-only"
              />
            </label>
            <label
              className={cn(
                "rounded-md cursor-pointer p-4 relative hover:bg-accent",
                billingPeriod === "monthly" ? "ring-2 ring-primary" : ""
              )}
            >
              {billingPeriod === "monthly" &&
                <div className="text-primary-foreground bg-primary p-0.5 rounded-full absolute top-2 right-2">
                  <Check className="stroke-[3] w-3 h-3"/>
                </div>
              }
              <div className="text-xs mb-1">Pay monthly</div>
              <div><span className="text-lg md:text-2xl font-semibold">$55</span>/month</div>
              <input
                type="radio"
                value="yearly"
                checked={billingPeriod === "monthly"} 
                onChange={() => setBillingPeriod("monthly")}
                className="sr-only"
              />
            </label>
          </header>
          <p className="text-sm">This will upgrade all repositories under &quot;{owner}&quot;, allowing you and your team to access Pro features:</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-x-2">
              <CircleCheck className="h-4 w-4 shrink-0" />
              Invite up to 10 users via email.
            </li>
            <li className="flex items-center gap-x-2">
              <CircleCheck className="h-4 w-4 shrink-0" />
              Granular email user permissions.
              <span className="rounded-full font-medium px-2 py-1 bg-accent text-xs ml-auto">Coming soon</span>
            </li>
            <li className="flex items-center gap-x-2">
              <CircleCheck className="h-4 w-4 shrink-0" />
              3rd party storage (e.g. S3).
              <span className="rounded-full font-medium px-2 py-1 bg-accent text-xs ml-auto">Coming soon</span>
            </li>
            <li className="flex items-center gap-x-2">
              <CircleCheck className="h-4 w-4 shrink-0" />
              Schedule content updates.
              <span className="rounded-full font-medium px-2 py-1 bg-accent text-xs ml-auto">Coming soon</span>
            </li>
          </ul>
        </div>
        <DialogFooter>
          <form action={handleCheckout} className="w-full">
            <input name="owner" type="hidden" value={owner} readOnly />
            <input name="billingPeriod" type="hidden" value={billingPeriod} />
            <input name="pathname" type="hidden" value={pathname} />
            <SubmitButton type="submit" className="w-full">
              Upgrade to Pro
            </SubmitButton>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}