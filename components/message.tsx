"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function Message({
  title,
  description,
  href,
  cta,
  className,
  children,
}: {
  title: string;
  description: React.ReactNode;
  href?: string;
  cta?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("p-4 md:p-6 flex justify-center items-center", className)}>
      <div className="max-w-[340px] text-center">
        <h1 className="text-xl lg:text-2xl font-semibold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
        {children
          ? children
          : href && cta
            ? <Link className={buttonVariants({ variant: "default", size: "sm" })} href={href}>{cta}</Link>
            : null
        }
      </div>
    </div>
  );
}
