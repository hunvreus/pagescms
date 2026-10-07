import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import packageJson from '../../../package.json'

import type { ReactNode } from 'react'

const version = packageJson.version
const UPDATE_DOCS_URL = 'https://pagescms.org/docs'

export function AboutDialog() {
  const [open, setOpen] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    void fetch('/api/app/version', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null
        return response.json()
      })
      .then((data: unknown) => {
        setLatestVersion(
          typeof data === 'object' &&
            data !== null &&
            'latest' in data &&
            typeof data.latest === 'string'
            ? data.latest
            : null,
        )
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLatestVersion(null)
      })

    return () => controller.abort()
  }, [open])

  const updateAvailable = useMemo(
    () => Boolean(latestVersion && compareSemver(version, latestVersion) < 0),
    [latestVersion],
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                aria-label="About Pages CMS"
                size="icon-sm"
                variant="ghost"
              >
                <PagesCmsMark />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>About Pages CMS</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="w-80 max-w-[calc(100vw-2rem)]">
        <DialogHeader className="items-center gap-3 text-center">
          <div className="flex size-15 items-center justify-center rounded-2xl bg-[oklch(0.60_0.13_163)] text-[oklch(0.98_0.02_166)] dark:bg-[oklch(0.70_0.15_162)] dark:text-[oklch(0.26_0.05_173)]">
            <PagesCmsGlyph className="size-10" />
          </div>
          <DialogTitle className="text-base font-semibold">
            Pages CMS
          </DialogTitle>
          <DialogDescription>
            Open source CMS for static sites. Edit directly on GitHub with a
            clean interface.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border">
          <Row label="Version">
            <div className="flex items-center gap-2">
              <span>{version}</span>
              {updateAvailable ? (
                <a
                  className="inline-flex"
                  href={UPDATE_DOCS_URL}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <Badge
                    className="bg-primary/10 font-medium text-primary"
                    variant="secondary"
                  >
                    Update to {latestVersion}
                    <ArrowUpRight className="ml-1 size-3" />
                  </Badge>
                </a>
              ) : null}
            </div>
          </Row>
          <Row label="Website">
            <ExternalLink href="https://pagescms.org">
              pagescms.org
            </ExternalLink>
          </Row>
          <Row label="Docs">
            <ExternalLink href="https://pagescms.org/docs">
              pagescms.org/docs
            </ExternalLink>
          </Row>
          <Row label="GitHub">
            <ExternalLink href="https://github.com/pagescms/pagescms">
              pagescms/pagescms
            </ExternalLink>
          </Row>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PagesCmsMark() {
  return (
    <span className="flex size-6 items-center justify-center rounded-md bg-[oklch(0.60_0.13_163)] text-[oklch(0.98_0.02_166)] dark:bg-[oklch(0.70_0.15_162)] dark:text-[oklch(0.26_0.05_173)]">
      <PagesCmsGlyph className="size-4" />
    </span>
  )
}

function PagesCmsGlyph({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="M0 4.8A4.8 4.8 0 0 1 4.8 0h7.212a4.8 4.8 0 0 1 3.394 1.406l7.188 7.188A4.8 4.8 0 0 1 24 11.988V19.2a4.8 4.8 0 0 1-4.8 4.8H4.8A4.8 4.8 0 0 1 0 19.2V4.8Z"
        fill="currentColor"
      />
    </svg>
  )
}

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  )
}

function ExternalLink({
  children,
  href,
}: {
  children: ReactNode
  href: string
}) {
  return (
    <a
      className="text-primary hover:underline"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      {children}
    </a>
  )
}

function compareSemver(a: string, b: string) {
  const aParts = parseSemver(a)
  const bParts = parseSemver(b)
  if (!aParts || !bParts) return 0
  for (let index = 0; index < 3; index += 1) {
    if (aParts[index] > bParts[index]) return 1
    if (aParts[index] < bParts[index]) return -1
  }
  return 0
}

function parseSemver(value: string): [number, number, number] | null {
  const match = value
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}
