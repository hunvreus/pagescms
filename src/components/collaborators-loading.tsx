import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Fragment } from 'react'
import UserPlus from '@hugeicons/core-free-icons/UserPlusIcon'
import { SearchInput } from './search-input'
import { Button } from './ui/button'
import { CollaboratorsTableSkeleton } from '#/features/admin/collaborators-skeleton'
import type { RepositoryPageProps } from '#/plugins/client'

export function CollaboratorsLoading({
  HeaderActions,
}: Pick<RepositoryPageProps, 'HeaderActions'>) {
  const { t: _t } = useUiMessages()
  const Header = HeaderActions ?? Fragment
  const search = (
    <SearchInput
      disabled
      aria-label={_t({ message: 'Search collaborators' })}
      placeholder={_t({ message: 'Search collaborators…' })}
    />
  )

  return (
    <>
      {HeaderActions ? (
        <HeaderActions placement="toolbar">{search}</HeaderActions>
      ) : (
        search
      )}
      {HeaderActions ? <div className="-mt-4 md:hidden">{search}</div> : null}
      <Header>
        <Button
          disabled
          aria-label={_t({ message: 'Invite collaborator' })}
          className="max-md:size-8 max-md:p-0"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={UserPlus}
            className="md:hidden"
          />
          <span className="hidden md:inline">
            <UiTrans>Invite collaborator</UiTrans>
          </span>
        </Button>
      </Header>
      <CollaboratorsTableSkeleton />
    </>
  )
}
