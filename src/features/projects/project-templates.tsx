import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ChevronsUpDown, LoaderCircle } from 'lucide-react'

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
import { OperationError } from '#/components/operation-error'
import { copyProjectTemplate } from '#/functions/projects'
import { PROJECT_TEMPLATES } from '#/lib/project-templates'

import type { ProjectTemplate } from '#/lib/project-templates'
import type { ProjectAccount } from '#/server/projects.server'

export function ProjectTemplates({
  accounts,
  defaultAccount,
}: {
  accounts: readonly ProjectAccount[]
  defaultAccount: ProjectAccount | null
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">
        Create from a template
      </h2>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {PROJECT_TEMPLATES.map((template) => (
          <TemplateDialog
            accounts={accounts}
            defaultAccount={defaultAccount}
            key={template.repository}
            template={template}
          />
        ))}
      </div>
    </section>
  )
}

function TemplateDialog({
  accounts,
  defaultAccount,
  template,
}: {
  accounts: readonly ProjectAccount[]
  defaultAccount: ProjectAccount | null
  template: ProjectTemplate
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(
    defaultAccount ?? accounts[0],
  )
  const [name, setName] = useState<string>(template.suggestedName)
  useEffect(() => {
    if (defaultAccount) setSelectedAccount(defaultAccount)
  }, [defaultAccount])
  const copy = useMutation({
    mutationFn: () =>
      copyProjectTemplate({
        data: {
          account: selectedAccount,
          name,
          template: template.repository,
        },
      }),
    onSuccess: async (repository) => {
      setOpen(false)
      await router.navigate({
        to: '/$owner/$repo/$branch',
        params: {
          owner: repository.owner,
          repo: repository.repo,
          branch: repository.defaultBranch,
        },
      })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="overflow-hidden rounded-md border text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          type="button"
        >
          <img
            alt={`Preview for ${template.name}`}
            className="aspect-video w-full object-cover"
            src={template.thumbnail}
          />
          <div className="truncate border-t px-3 py-2 text-sm font-medium">
            {template.name}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            copy.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Copy template</DialogTitle>
            <DialogDescription>
              Create {template.repository} under one of your GitHub accounts.
            </DialogDescription>
          </DialogHeader>
          <div>
            <FieldGroup className="gap-4">
              <Field orientation="horizontal">
                <div className="w-20 shrink-0 pt-2">
                  <FieldLabel>Account</FieldLabel>
                </div>
                <FieldContent>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                      >
                        <img
                          alt={`${selectedAccount.login}'s avatar`}
                          className="size-6 rounded"
                          src={`https://github.com/${encodeURIComponent(selectedAccount.login)}.png?size=48`}
                        />
                        <span className="truncate">
                          {selectedAccount.login}
                        </span>
                        <ChevronsUpDown className="ml-auto opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {accounts.map((account) => (
                        <DropdownMenuItem
                          key={`${account.login}:${account.installationId}`}
                          onSelect={() => setSelectedAccount(account)}
                        >
                          <img
                            alt={`${account.login}'s avatar`}
                            className="size-6 rounded"
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
                    Name
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
            {copy.isError ? (
              <OperationError
                error={copy.error}
                fallback="Could not create the repository."
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button disabled={copy.isPending || !name.trim()} type="submit">
              {copy.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              Create copy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
