"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { useConfig } from "@/contexts/config-context";
import { getSiteSettings } from "@/lib/site";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function CopyButton({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(label);
        } catch {
          toast.error("Could not copy snippet.");
        }
      }}
    >
      <Copy />
      Copy
    </Button>
  );
}

export function SiteEmbedPanel() {
  const { config } = useConfig();
  const [cmsOrigin, setCmsOrigin] = useState("");

  useEffect(() => {
    setCmsOrigin(window.location.origin);
  }, []);

  const siteSettings = config ? getSiteSettings(config.object) : {};

  const scriptSnippet = useMemo(() => {
    if (!cmsOrigin || !config) return "";
    return `<script
  defer
  src="${cmsOrigin}/pagescms-site.js"
  data-pagescms-owner="${config.owner}"
  data-pagescms-repo="${config.repo}"
  data-pagescms-branch="${config.branch}"
></script>`;
  }, [cmsOrigin, config]);

  if (!config) return null;

  const toggleSnippet = `<button type="button" onclick="window.PagesCMS?.toggle()">Pages CMS</button>`;

  const metadataSnippet = `<meta name="pagescms:name" content="posts">
<meta name="pagescms:type" content="collection">
<meta name="pagescms:path" content="content/posts/hello-world.md">`;

  const openSiteAdminUrl = siteSettings?.url
    ? `${siteSettings.url}#pagescms`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Embed</CardTitle>
        <CardDescription>
          Drop the script on the public site to enable the iframe preview bridge
          and the optional in-page Pages CMS admin bar.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Embed script</div>
              <div className="text-sm text-muted-foreground">
                Add this once, ideally in the site layout.
              </div>
            </div>
            <CopyButton label="Embed snippet copied." value={scriptSnippet} />
          </div>
          <Textarea
            readOnly
            value={scriptSnippet}
            className="min-h-32 font-mono text-xs"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Optional toggle button</div>
              <div className="text-sm text-muted-foreground">
                Site owners can place this anywhere, for example on `/admin`.
              </div>
            </div>
            <CopyButton label="Toggle snippet copied." value={toggleSnippet} />
          </div>
          <Textarea
            readOnly
            value={toggleSnippet}
            className="min-h-20 font-mono text-xs"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Optional page metadata</div>
              <div className="text-sm text-muted-foreground">
                Add this on a page if you want the site admin bar to link
                directly to the matching entry.
              </div>
            </div>
            <CopyButton label="Metadata snippet copied." value={metadataSnippet} />
          </div>
          <Textarea
            readOnly
            value={metadataSnippet}
            className="min-h-28 font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {openSiteAdminUrl ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={openSiteAdminUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Site Admin
                <ArrowUpRight />
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Open Site Admin
              <ArrowUpRight />
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {siteSettings?.url
              ? `Uses ${siteSettings.url}.`
              : "Set settings.site.url in .pages.yml to enable public URLs and the site admin launcher."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
