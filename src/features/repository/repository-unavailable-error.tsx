import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'

import { ApiNotFoundError } from '#/client/api'
import { authClient } from '#/client/api/auth'
import { authenticationQueryOptions } from '#/client/queries/session'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { RootError } from '#/components/root-error'
import { getSignInUrl } from '#/lib/auth-redirect'
import { notifyError } from '#/lib/notifications'

export function RepositoryUnavailableError(props: ErrorComponentProps) {
  const { t } = useUiMessages()
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (
    !(props.error instanceof Error) ||
    !(
      props.error instanceof ApiNotFoundError ||
      props.error.name === 'AccessDeniedError' ||
      props.error.message.startsWith('You do not have permission to access ')
    )
  )
    return <RootError {...props} />

  async function switchAccount() {
    setPending(true)
    try {
      const account = client.getQueryData(authenticationQueryOptions().queryKey)
        ?.user?.id
      if (!account) throw new Error('Authentication required')
      const result = await authClient.signOut()
      if (result.error) throw new Error(result.error.message)
      window.location.assign(
        getSignInUrl(window.location.pathname + window.location.search),
      )
    } catch (error) {
      notifyError(error, t({ message: 'Could not sign out.' }))
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            <UiTrans>Repository not found</UiTrans>
          </EmptyTitle>
          <EmptyDescription>
            <UiTrans>
              This repository may not exist, or you may not have access to it.
              If you were invited, sign in with the account that received the
              invitation.
            </UiTrans>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link to="/">
              <UiTrans>Back to projects</UiTrans>
            </Link>
          </Button>
          <Button
            disabled={!ready || pending}
            aria-busy={pending}
            onClick={() => void switchAccount()}
          >
            <UiTrans>Switch account</UiTrans>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
