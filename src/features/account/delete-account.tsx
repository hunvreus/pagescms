import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { deleteAccountDescription } from './account-copy'
import { notifyError } from '#/lib/notifications'
import { Spinner } from '#/components/ui/spinner'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { OperationError } from '#/components/operation-error'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { deleteAccount } from '#/client/api/account'
import { authClient } from '#/client/api/auth'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { authenticationQueryOptions } from '#/client/queries/session'
import { cn } from 'cn'
import { settingsRowClassName } from '#/components/settings-row'

export function DeleteAccount({
  user,
}: {
  user: { id: string; email: string }
}) {
  const { t: _t, i18n: _i18n } = useUiMessages()

  const client = useQueryClient()
  const active = accountIsActive(client, user.id)
  const otherAccount = () => {
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    return Boolean(account && account !== user.id)
  }
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [reauthenticate, setReauthenticate] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  async function signOut(destination: string) {
    if (otherAccount()) return
    if (active()) {
      const result = await authClient.signOut()
      if (result.error) throw new Error('Could not sign out. Try again.')
    }
    await client.cancelQueries()
    if (otherAccount()) return
    client.clear()
    window.location.assign(destination)
  }

  async function remove() {
    if (busy || email.trim().toLowerCase() !== user.email.toLowerCase()) return
    setBusy(true)
    setError(null)
    try {
      const result = await deleteAccount({ accountId: user.id, email })
      if (result.status === 'reauthentication-required') {
        setReauthenticate(true)
        setError(new Error('Sign in again before deleting your account.'))
      } else {
        // The database sessions are already revoked. A failed cookie cleanup
        // must not leave a deleted account's private queries on screen.
        try {
          const { clearDeletedAccountData } =
            await import('./local-account-storage')
          await clearDeletedAccountData(user.id).catch(() => undefined)
          if (active()) await authClient.signOut()
        } finally {
          if (!otherAccount()) {
            await client.cancelQueries()
            if (!otherAccount()) {
              client.clear()
              window.location.assign('/sign-in?deleted=true')
            }
          }
        }
      }
    } catch (cause) {
      notifyError(
        cause,
        _t({ message: 'Could not delete your account. Try again.' }),
        {
          account: user.id,
        },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="danger-zone-title">
      <h2 id="danger-zone-title" className="text-base font-medium">
        <UiTrans>Danger zone</UiTrans>
      </h2>
      <div className="rounded-xl border bg-card px-4">
        <div className={cn(settingsRowClassName, 'py-4')}>
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              <UiTrans>Delete account</UiTrans>
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {_i18n._(deleteAccountDescription)}
            </p>
          </div>
          <AlertDialog
            open={open}
            onOpenChange={(value) => {
              if (busy) return
              setOpen(value)
              if (!value) {
                setEmail('')
                setError(null)
                setReauthenticate(false)
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                className="justify-self-end"
                disabled={!ready}
                variant="destructive"
              >
                <UiTrans>Delete account</UiTrans>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <UiTrans>Delete your account?</UiTrans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <UiTrans>
                    Your profile, sign-in methods and collaborator access will
                    be permanently deleted. GitHub repositories and their
                    content will be kept. This cannot be undone.
                  </UiTrans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <form
                id="delete-account-form"
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void remove()
                }}
              >
                <Field>
                  <FieldLabel htmlFor="delete-account-email">
                    <UiTrans>Enter {user.email} to confirm</UiTrans>
                  </FieldLabel>
                  <Input
                    id="delete-account-email"
                    type="email"
                    autoComplete="off"
                    value={email}
                    disabled={busy}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <OperationError
                  error={error}
                  title={_t({ message: 'Sign in again' })}
                  fallback={_t({
                    message: 'Could not delete your account. Try again.',
                  })}
                />
              </form>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>
                  <UiTrans>Cancel</UiTrans>
                </AlertDialogCancel>
                {reauthenticate ? (
                  <Button
                    aria-busy={busy}
                    disabled={busy}
                    onClick={() => {
                      setBusy(true)
                      void signOut('/sign-in?redirect=%2Fsettings').catch(
                        (cause) => {
                          notifyError(
                            cause,
                            _t({ message: 'Could not sign out. Try again.' }),
                            {
                              account: user.id,
                            },
                          )
                          setBusy(false)
                        },
                      )
                    }}
                  >
                    <UiTrans>Sign in again</UiTrans>
                    {busy ? (
                      <Spinner aria-hidden="true" data-icon="inline-end" />
                    ) : null}
                  </Button>
                ) : (
                  <Button
                    aria-busy={busy}
                    form="delete-account-form"
                    type="submit"
                    variant="destructive"
                    disabled={
                      busy ||
                      email.trim().toLowerCase() !== user.email.toLowerCase()
                    }
                  >
                    <UiTrans>Delete account</UiTrans>
                    {busy ? (
                      <Spinner aria-hidden="true" data-icon="inline-end" />
                    ) : null}
                  </Button>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </section>
  )
}
