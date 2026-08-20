import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Cloud, Plug, Route as RouteIcon } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { pluginRegistry } from '#/plugins/discovery'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16 sm:py-24">
        <header className="flex max-w-2xl flex-col gap-5">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            TanStack Start foundation
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Pages CMS
          </h1>
          <p className="text-balance text-lg leading-8 text-muted-foreground">
            The new application shell is running on TanStack Start, prepared for
            fast navigation, explicit caching, Cloudflare Workers, and trusted
            build-time plugins.
          </p>
          <div>
            <Button asChild>
              <a href="/api/health">Check service health</a>
            </Button>
          </div>
        </header>

        <section
          aria-label="Foundation status"
          className="grid gap-4 sm:grid-cols-3"
        >
          <FoundationCard
            description="Typed file routes with intent preloading and stable layouts."
            icon={RouteIcon}
            title="Routing"
          />
          <FoundationCard
            description="Workers-native build, generated bindings, and dry-run validation."
            icon={Cloud}
            title="Cloudflare"
          />
          <FoundationCard
            description={`${pluginRegistry.plugins.length} deployment plugin${pluginRegistry.plugins.length === 1 ? '' : 's'} discovered.`}
            icon={Plug}
            title="Plugins"
          />
        </section>
      </div>
    </main>
  )
}

interface FoundationCardProps {
  description: string
  icon: typeof RouteIcon
  title: string
}

function FoundationCard({
  description,
  icon: Icon,
  title,
}: FoundationCardProps) {
  return (
    <article className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
      <Icon className="mb-4 size-5 text-primary" aria-hidden="true" />
      <h2 className="font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </article>
  )
}
