import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import {
  RepositoryTemplatePreview,
  RepositoryTemplatesSection,
} from './repository-template-preview'
import { HugeiconsIcon } from '@hugeicons/react'
import { authenticationQueryOptions } from '#/client/queries/session'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import ChevronsUpDown from '@hugeicons/core-free-icons/UnfoldMoreIcon'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { notifyError, OperationAcknowledgementError } from '#/lib/notifications'
import { copyRepositoryTemplate } from '#/client/api/repositories'
import { REPOSITORY_TEMPLATES } from '#/shared/repository-templates'

import type { RepositoryTemplate } from '#/shared/repository-templates'
import type { RepositoryAccount } from '#/server/repository/repositories'

export function RepositoryTemplates({
  accounts,
  defaultAccount,
}: {
  accounts: readonly RepositoryAccount[]
  defaultAccount: RepositoryAccount | null
}) {
  return (
    <RepositoryTemplatesSection>
      {REPOSITORY_TEMPLATES.map((template) => (
        <TemplateDialog
          accounts={accounts}
          defaultAccount={defaultAccount}
          key={template.repository}
          template={template}
        />
      ))}
    </RepositoryTemplatesSection>
  )
}

function TemplateDialog({
  accounts,
  defaultAccount,
  template,
}: {
  accounts: readonly RepositoryAccount[]
  defaultAccount: RepositoryAccount | null
  template: RepositoryTemplate
}) {
  const { t: _t } = useUiMessages()

  const router = useRouter()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(
    defaultAccount ?? accounts[0],
  )
  const [name, setName] = useState<string>(template.suggestedName)
  useEffect(() => {
    if (defaultAccount) setSelectedAccount(defaultAccount)
  }, [defaultAccount])
  const copy = useMutation({
    onError: (error, variables: { accountId?: string }) =>
      notifyError(error, _t({ message: 'Could not create the repository.' }), {
        account: variables.accountId,
      }),
    mutationFn: (_variables: { accountId?: string }) =>
      copyRepositoryTemplate({
        account: selectedAccount,
        name,
        template: template.repository,
      }),
    onSuccess: async (repository, variables) => {
      if (
        client.getQueryData(authenticationQueryOptions().queryKey)?.user?.id !==
        variables.accountId
      )
        return
      const { toast } = await import('#/lib/notifications')
      setOpen(false)
      try {
        await router.navigate({
          to: '/github/$owner/$repo/$branch',
          params: {
            owner: repository.owner,
            repo: repository.repo,
            branch: repository.defaultBranch,
          },
        })
      } catch (error) {
        throw new OperationAcknowledgementError(error)
      }
      toast.success(_t({ message: `Repository “${repository.repo}” created` }))
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="overflow-hidden rounded-md border text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          type="button"
        >
          <RepositoryTemplatePreview template={template} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            copy.mutate({
              accountId: client.getQueryData(
                authenticationQueryOptions().queryKey,
              )?.user?.id,
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Copy template</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Create {template.repository} under one of your GitHub accounts.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <div>
            <FieldGroup className="gap-4">
              <Field orientation="horizontal">
                <div className="w-20 shrink-0 pt-2">
                  <FieldLabel>
                    <UiTrans>Account</UiTrans>
                  </FieldLabel>
                </div>
                <FieldContent>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                      >
                        <img
                          alt={_t({
                            message: `${selectedAccount.login}'s avatar`,
                          })}
                          className="size-5 shrink-0 rounded"
                          data-icon="inline-start"
                          src={`https://github.com/${encodeURIComponent(selectedAccount.login)}.png?size=48`}
                        />
                        <span className="truncate">
                          {selectedAccount.login}
                        </span>
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={ChevronsUpDown}
                          className="ml-auto text-muted-foreground"
                          data-icon="inline-end"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-max min-w-[max(8rem,var(--radix-dropdown-menu-trigger-width))] max-w-[calc(100vw-2rem)]"
                    >
                      {accounts.map((account) => (
                        <DropdownMenuItem
                          key={`${account.login}:${account.installationId}`}
                          onSelect={() => setSelectedAccount(account)}
                        >
                          <img
                            alt={_t({ message: `${account.login}'s avatar` })}
                            className="size-5 shrink-0 rounded"
                            src={`https://github.com/${encodeURIComponent(account.login)}.png?size=48`}
                          />
                          {account.login}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <div className="w-20 shrink-0 pt-2">
                  <FieldLabel htmlFor={`name-${template.repository}`}>
                    <UiTrans>Name</UiTrans>
                  </FieldLabel>
                </div>
                <FieldContent>
                  <Input
                    id={`name-${template.repository}`}
                    maxLength={100}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button disabled={copy.isPending || !name.trim()} type="submit">
              <UiTrans>Create copy</UiTrans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
