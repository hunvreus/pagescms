import { History, EllipsisVertical } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { EditorLayout } from '#/components/editor-layout'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'

export function ConfigurationSkeleton() {
  return (
    <EditorLayout
      header={
        <RepositoryPageHeader
          actions={
            <>
              <Button
                disabled
                variant="outline"
                size="icon"
                aria-label="Entry history"
              >
                <History />
              </Button>
              <Button disabled>Save</Button>
              <Button
                disabled
                variant="outline"
                size="icon"
                aria-label="Entry actions"
              >
                <EllipsisVertical />
              </Button>
            </>
          }
        >
          <RepositoryPageTitle>Configuration</RepositoryPageTitle>
        </RepositoryPageHeader>
      }
    >
      <Skeleton
        aria-label="Loading configuration"
        aria-busy="true"
        className="min-h-32 w-full rounded-xl"
      />
    </EditorLayout>
  )
}
