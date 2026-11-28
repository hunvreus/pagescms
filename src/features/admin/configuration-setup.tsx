import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import Book02Icon from '@hugeicons/core-free-icons/Book02Icon'
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'

export function ConfigurationSetup() {
  const { t: _t } = useUiMessages()

  return (
    <Alert role="region" aria-label={_t({ message: 'Configuration setup' })}>
      <AlertTitle>
        <UiTrans>Configure your project</UiTrans>
      </AlertTitle>
      <AlertDescription>
        <p>
          <UiTrans>
            Save a configuration file (<code>.pages.yml</code>) to define the
            content, media, actions and other settings for this project.
          </UiTrans>
        </p>
      </AlertDescription>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a
            href="https://pagescms.org/docs/configuration/"
            target="_blank"
            rel="noreferrer"
          >
            <HugeiconsIcon
              icon={Book02Icon}
              aria-hidden="true"
              data-icon="inline-start"
            />
            <UiTrans>Read the docs</UiTrans>
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              className="opacity-50"
              aria-hidden="true"
              data-icon="inline-end"
            />
          </a>
        </Button>
      </div>
    </Alert>
  )
}
