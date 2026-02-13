"use client";

import * as React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CircleHelp, Chrome, Book, Github } from "lucide-react";
import { cn } from "@/lib/utils";

export function About({
  onClick
}: {
  onClick?: () => void;
}) {
  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <svg className="size-3" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 4.8C0 2.14903 2.14903 0 4.8 0H12.0118C13.2848 0 14.5057 0.505713 15.4059 1.40589L22.5941 8.59411C23.4943 9.49429 24 10.7152 24 11.9882V19.2C24 21.851 21.851 24 19.2 24H4.8C2.14903 24 0 21.851 0 19.2V4.8Z"></path>
                </svg>
                <span className="sr-only">About Pages CMS</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            About Pages CMS</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About Pages CMS</DialogTitle>
          <DialogDescription>Pages CMS is an Open Source Content Management System built for static websites (Jekyll, Next.js, VuePress, Hugo, etc). It allows you to edit your website&apos;s content directly on GitHub via a user-friendly interface.</DialogDescription>
        </DialogHeader>
        <footer className="grid grid-flow-col justify-stretch text-sm gap-x-2">
          <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")} href="https://pagescms.org" target="_blank">
            <Chrome className="h-4 w-4 shrink-0 mr-2"/>
            Website
          </a>
          <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")} href="https://pagescms.org/docs" target="_blank">
            <Book className="h-4 w-4 shrink-0 mr-2"/>
            Docs
          </a>
          <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")} href="https://github.com/pages-cms/pages-cms" target="_blank">
            <Github className="h-4 w-4 shrink-0 mr-2"/>
            GitHub
          </a>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
