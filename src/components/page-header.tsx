import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'

export function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              aria-label="Back to projects"
              size="icon"
              variant="outline"
            >
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to projects</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
    </header>
  )
}
