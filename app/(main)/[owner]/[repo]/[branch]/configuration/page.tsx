"use client";

import Link from "next/link";
import { Entry } from "@/components/entry/entry";
import {
  DocumentTitle,
  formatRepoBranchTitle,
} from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookText } from "lucide-react";

export default function Page() {
  const { config, setConfig } = useConfig();
  const { user } = useUser();

  const handleSave = async (data: Record<string, any>) => {
    setConfig(data.config);
  };

  if (!hasGithubIdentity(user)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Access denied</EmptyTitle>
          <EmptyDescription>
            Only GitHub users can manage repository configuration.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {config && (
        <DocumentTitle
          title={formatRepoBranchTitle(
            "Configuration",
            config.owner,
            config.repo,
            config.branch,
          )}
        />
      )}
      <Entry
        path=".pages.yml"
        onSave={handleSave}
        title="Configuration"
        headerMeta={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
              >
                <Link
                  href="https://pagescms.org/docs/configuration/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookText />
                  <span className="sr-only">Configuration docs</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View docs</TooltipContent>
          </Tooltip>
        }
      />
    </>
  );
}
