import { useLingui } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import Search from '@hugeicons/core-free-icons/Search01Icon'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import type { ComponentProps } from 'react'

export function SearchInput({
  groupClassName = 'sm:w-64',
  loading = false,
  loadingLabel,
  ...props
}: ComponentProps<typeof InputGroupInput> & {
  groupClassName?: string
  loading?: boolean
  loadingLabel?: string
}) {
  const { t } = useLingui()
  return (
    <InputGroup className={groupClassName}>
      <InputGroupInput {...props} />
      <InputGroupAddon>
        {loading ? (
          <Spinner
            aria-label={loadingLabel ?? t({ message: 'Refreshing results' })}
          />
        ) : (
          <HugeiconsIcon aria-hidden="true" icon={Search} />
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}
