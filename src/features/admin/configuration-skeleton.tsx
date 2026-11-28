import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import History from '@hugeicons/core-free-icons/HistoryIcon'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import { EditorSkeleton } from '#/components/editor-skeleton'
import { EditorLayout } from '#/components/editor-layout'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'

export function ConfigurationSkeleton() {
  const { t: _t } = useUiMessages()
  const canViewGitHub = useRepositoryGitHubLink()

  return (
    <EditorLayout
      header={
        <RepositoryPageHeader
          actions={
            <>
              <Button disabled>
                <UiTrans>Save</UiTrans>
              </Button>
              <ButtonGroup
                aria-label={_t({ message: 'History and entry actions' })}
              >
                <Button
                  disabled
                  variant="outline"
                  size="icon"
                  aria-label={_t({ message: 'Entry history' })}
                >
                  <HugeiconsIcon aria-hidden="true" icon={History} />
                </Button>
                {canViewGitHub ? (
                  <Button
                    disabled
                    variant="outline"
                    size="icon"
                    aria-label={_t({ message: 'Entry actions' })}
                  >
                    <HugeiconsIcon aria-hidden="true" icon={EllipsisVertical} />
                  </Button>
                ) : null}
              </ButtonGroup>
            </>
          }
        >
          <RepositoryPageTitle>
            <UiTrans>Configuration</UiTrans>
          </RepositoryPageTitle>
        </RepositoryPageHeader>
      }
    >
      <EditorSkeleton
        label={_t({ message: 'Loading configuration' })}
        className="rounded-xl"
      />
    </EditorLayout>
  )
}
