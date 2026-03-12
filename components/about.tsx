"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";

const AboutDialogContent = dynamic(
  () => import("./about-dialog-content").then((m) => m.AboutDialogContent),
  { ssr: false },
);

export function About() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon-sm">
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
      {open ? <AboutDialogContent /> : null}
    </Dialog>
  )
}
