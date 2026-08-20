"use client";

import { ActionsPage } from "@/components/actions/actions-page";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getRootActions, getSchemaActions } from "@/lib/actions";

export default function Page() {
  const { config } = useConfig();
  const { user } = useUser();

  if (!config) throw new Error("Configuration not found.");

  if (!hasGithubIdentity(user)) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Access denied</EmptyTitle>
          <EmptyDescription>Only GitHub users can view action history.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const actionLabels = {
    ...Object.fromEntries(getRootActions(config.object).map((action) => [action.name, action.label])),
    ...Object.fromEntries(
      ((config.object as any).content ?? []).flatMap((item: any) =>
        getSchemaActions(item).concat(getSchemaActions(item, "collection"), getSchemaActions(item, "entry"))
          .map((action) => [action.name, action.label] as const),
      ),
    ),
    ...Object.fromEntries(
      ((config.object as any).media ?? []).flatMap((item: any) =>
        ((item.actions ?? []) as Array<{ name: string; label: string }>).map((action) => [action.name, action.label] as const),
      ),
    ),
  };

  const contextLabels = {
    ...Object.fromEntries(
      ((config.object as any).content ?? []).flatMap((item: any) => {
        const label = item.label || item.name;
        if (item.type === "collection") {
          return [
            [`collection:${item.name}`, label] as const,
            [`entry:${item.name}`, label] as const,
          ];
        }

        return [[`file:${item.name}`, label] as const];
      }),
    ),
    ...Object.fromEntries(
      ((config.object as any).media ?? []).map((item: any) => [
        `media:${item.name}`,
        item.label || item.name,
      ]),
    ),
  };

  return (
    <>
      <DocumentTitle
        title={formatRepoBranchTitle("Actions", config.owner, config.repo, config.branch)}
      />
      <div className="flex w-full flex-1 flex-col">
        <ActionsPage
          owner={config.owner}
          repo={config.repo}
          branch={config.branch}
          actionLabels={actionLabels}
          contextLabels={contextLabels}
        />
      </div>
    </>
  );
}
