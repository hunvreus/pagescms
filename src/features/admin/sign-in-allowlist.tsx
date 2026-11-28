import { useEffect, useRef, useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Trans as UiTrans, useLingui } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import PlusIcon from '@hugeicons/core-free-icons/Add01Icon'
import ArrowDownIcon from '@hugeicons/core-free-icons/ArrowDown01Icon'
import { getSignInAllowlist, updateSignInAllowlist } from '#/client/api/admin'
import { queryKeys } from '#/client/queries/keys'
import {
  allowlistRuleSchema,
  parseAllowlistEmails,
} from '#/shared/sign-in-allowlist'
import { notifyError } from '#/lib/notifications'
import { SearchInput } from '#/components/search-input'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { CollaboratorInviteInput } from '#/components/collaborator-invite-input'
import { Field, FieldLabel, FieldError } from '#/components/ui/field'
import { Spinner } from '#/components/ui/spinner'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { AllowlistTable } from './allowlist-table'

export function SignInAllowlist() {
  const { t } = useLingui()
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<'add' | 'import'>('add')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [type, setType] = useState<'email' | 'domain' | 'pattern'>('email')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [remove, setRemove] = useState<{ id: string; value: string } | null>(
    null,
  )
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])
  const list = useQuery({
    queryKey: [...queryKeys.admin(), 'allowlist', { query, page }],
    queryFn: () => getSignInAllowlist({ query, page }),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const lastData = useRef<typeof list.data>(undefined)
  useEffect(() => {
    if (list.data && !list.isPlaceholderData) lastData.current = list.data
  }, [list.data, list.isPlaceholderData])
  const data = list.data ?? lastData.current
  async function save() {
    if (pending || !dialogOpen) return
    let action: unknown
    let pattern: string | undefined
    if (dialog === 'add') {
      const parsed = allowlistRuleSchema.safeParse({ type, value })
      if (!parsed.success) {
        setError(t`Enter a valid rule.`)
        return
      }
      action = { action: 'add', ...parsed.data }
      if (parsed.data.type === 'pattern') pattern = parsed.data.value
    } else {
      try {
        parseAllowlistEmails(value)
      } catch {
        setError(t`Enter valid email addresses.`)
        return
      }
      action = { action: 'import', emails: value }
    }
    setPending(true)
    setError('')
    try {
      if (pattern) {
        const { default: safeRegex } = await import('safe-regex2')
        if (!safeRegex(pattern)) {
          setError(t`Enter a valid rule.`)
          return
        }
      }
      await updateSignInAllowlist(action)
      setDialogOpen(false)
      setValue('')
      await client.invalidateQueries({
        queryKey: [...queryKeys.admin(), 'allowlist'],
      })
    } catch (cause) {
      notifyError(cause, t`Could not update sign-in rules.`)
    } finally {
      setPending(false)
    }
  }
  async function removeRule() {
    if (!remove || pending) return
    setPending(true)
    try {
      await updateSignInAllowlist({ action: 'remove', id: remove.id })
      setRemove(null)
      await client.invalidateQueries({
        queryKey: [...queryKeys.admin(), 'allowlist'],
      })
    } catch (cause) {
      notifyError(cause, t`Could not update sign-in rules.`)
    } finally {
      setPending(false)
    }
  }
  function openDialog(next: 'add' | 'import') {
    setValue('')
    setError('')
    setDialog(next)
    setDialogOpen(true)
  }
  return (
    <section
      id="allowlist"
      aria-label={t`Sign-in access`}
      className="scroll-mt-6 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">
          <UiTrans>Sign-in access</UiTrans>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            groupClassName="w-48"
            aria-label={t`Search rules`}
            placeholder={t`Search rules…`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={!data}
          />
          <ButtonGroup>
            <Button
              variant="outline"
              disabled={!data}
              onClick={() => openDialog('add')}
            >
              <HugeiconsIcon
                icon={PlusIcon}
                aria-hidden="true"
                data-icon="inline-start"
              />
              <UiTrans>Add rule</UiTrans>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!data}
                  aria-label={t`More sign-in access actions`}
                >
                  <HugeiconsIcon icon={ArrowDownIcon} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onSelect={() => openDialog('import')}
                >
                  <UiTrans>Bulk import</UiTrans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </div>
      </div>
      <AllowlistTable
        rules={data?.rules}
        query={query}
        loading={list.isFetching}
        error={Boolean(list.error)}
        errorMessage={
          data
            ? data.query !== query
              ? t`Could not filter results. Previous results are still shown.`
              : t`Could not refresh sign-in rules. The displayed results may be out of date.`
            : undefined
        }
        onRetry={() => void list.refetch()}
        onRemove={setRemove}
      />
      {data && data.pages > 1 ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={data.page <= 1 || list.isFetching}
            onClick={() => setPage(data.page - 1)}
          >
            <UiTrans>Previous</UiTrans>
          </Button>
          <Button
            variant="outline"
            disabled={data.page >= data.pages || list.isFetching}
            onClick={() => setPage(data.page + 1)}
          >
            <UiTrans>Next</UiTrans>
          </Button>
        </div>
      ) : null}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !pending) setDialogOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'add' ? t`Add rule` : t`Bulk import`}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'add'
                ? t`New sign-ins must match an allowed email, domain, or pattern. With no rules, anyone can sign in. Existing sessions remain active.`
                : t`Add multiple email addresses as sign-in rules. Separate addresses with commas, semicolons, or line breaks. Existing rules are kept.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
            className="space-y-4"
          >
            {dialog === 'add' ? (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="allowlist-value" className="sr-only">
                  <UiTrans>Rule</UiTrans>
                </FieldLabel>
                <ButtonGroup className="w-full" aria-label={t`Sign-in rule`}>
                  <Select
                    value={type}
                    onValueChange={(next) => {
                      if (
                        next === 'email' ||
                        next === 'domain' ||
                        next === 'pattern'
                      )
                        setType(next)
                    }}
                  >
                    <SelectTrigger
                      id="allowlist-type"
                      aria-label={t`Type`}
                      className="shrink-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        <SelectItem value="email">{t`Email`}</SelectItem>
                        <SelectItem value="domain">{t`Domain`}</SelectItem>
                        <SelectItem value="pattern">{t`Pattern`}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    id="allowlist-value"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? 'allowlist-value-error' : undefined
                    }
                    maxLength={255}
                    placeholder={
                      type === 'email'
                        ? 'user@example.com'
                        : type === 'domain'
                          ? 'example.com'
                          : String.raw`^[^@]+@example\.com$`
                    }
                  />
                </ButtonGroup>
                <FieldError id="allowlist-value-error">{error}</FieldError>
              </Field>
            ) : (
              <CollaboratorInviteInput
                value={value}
                onChange={(next) => {
                  setValue(next)
                  setError('')
                }}
                disabled={pending}
                showDescription={false}
                chipsClassName="max-h-40 overflow-y-auto"
                error={error || undefined}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {dialog === 'add' ? t`Add rule` : t`Import`}
                {pending ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <UiTrans>Remove sign-in rule?</UiTrans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <UiTrans>Remove this sign-in rule?</UiTrans> {remove?.value}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault()
                void removeRule()
              }}
            >
              <UiTrans>Remove</UiTrans>
              {pending ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
