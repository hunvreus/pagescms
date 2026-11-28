import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { toast, notifyError } from '#/lib/notifications'
import { useAccountPreferences } from '#/features/account/use-account-preferences'
import { StartTranslationDialog } from './start-translation-dialog'
import { stageTranslation, translationStartKey } from './translation-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import Check from '@hugeicons/core-free-icons/CheckIcon'
import Plus from '@hugeicons/core-free-icons/PlusIcon'
import { authenticationQueryOptions } from '#/client/queries/session'
import { entryTranslationsQueryOptions } from '#/client/queries/content'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { copyEntryMedia } from '#/lib/i18n-media'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import { Spinner } from '#/components/ui/spinner'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '#/components/ui/dropdown-menu'
import type { readTranslations } from '#/client/api/entries'
import { readEntry } from '#/client/api/entries'
import { LocaleMenuTrigger, localeMenuClassName } from './locale-context'
import type { JsonObject, JsonValue } from '#/shared/json'
import type { ContentI18n } from '#/lib/i18n'

type Translation = Awaited<ReturnType<typeof readTranslations>>[number]

export function FileLocaleMenu({
  coordinates,
  config,
  locale,
  schemaType,
  onCopy,
  currentValue,
  draftReady = false,
  allowCreate = true,
  draftDirty = false,
  saved = false,
  flush,
  fields = [],
  media = [],
}: {
  coordinates: {
    owner: string
    repo: string
    branch: string
    name: string
    path: string
    repoId?: string
    source?: string
  }
  config: ContentI18n
  locale: string | null
  schemaType: string
  onCopy?: (value: JsonObject | JsonValue[] | string) => void
  currentValue?: JsonObject | JsonValue[] | string
  draftReady?: boolean
  allowCreate?: boolean
  draftDirty?: boolean
  saved?: boolean
  flush?: () => Promise<void>
  fields?: Parameters<typeof copyEntryMedia>[0]
  media?: Parameters<typeof copyEntryMedia>[4]
}) {
  const { t: _t } = useUiMessages()

  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState<{ path: string; label: string } | null>(null)
  const [copying, setCopying] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [target, setTarget] = useState<Translation | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const router = useRouter()
  const client = useQueryClient()
  const auth = useQuery(authenticationQueryOptions())
  const preferences = useAccountPreferences(auth.data?.user?.id)
  // Languages come from config; only sibling-file availability needs a background read.
  const translations = useQuery(
    entryTranslationsQueryOptions(coordinates, auth.data?.user?.id),
  )
  const available = translations.data?.filter((item) => item.exists) ?? []
  const missing = translations.data?.filter((item) => !item.exists) ?? []
  const sources = available.filter((item) => item.code !== locale)
  const label =
    config.locales.find((item) => item.code === locale)?.label ??
    locale ??
    config.default

  useEffect(() => {
    const account = auth.data?.user?.id
    if (!account || !draftReady || !onCopy) return
    const key = translationStartKey(account, coordinates)
    const seed = client.getQueryData<JsonObject | JsonValue[] | string>(key)
    if (seed === undefined) return
    client.removeQueries({ queryKey: key, exact: true })
    if (saved || draftDirty) {
      toast.info(
        _t({
          message:
            'Existing translation or local draft resumed. Its content was preserved.',
        }),
      )
      return
    }
    onCopy(seed)
  }, [
    auth.data?.user?.id,
    coordinates,
    draftReady,
    draftDirty,
    saved,
    client,
    onCopy,
  ])

  function navigate(item: Translation) {
    return schemaType === 'file'
      ? router.navigate({
          to: '/github/$owner/$repo/$branch/file/$name',
          params: coordinates,
          search: { locale: item.code },
        })
      : router.navigate({
          to: '/github/$owner/$repo/$branch/collection/$name/entry/$',
          params: { ...coordinates, _splat: item.path },
          search: { locale: item.code },
        })
  }

  function startTranslation(destination: Translation, shouldCopy: boolean) {
    if (!allowCreate) return
    const account = auth.data?.user?.id
    const active = accountIsActive(client, account)
    const seedKey = account
      ? translationStartKey(account, {
          ...coordinates,
          path: destination.path,
        })
      : undefined
    setStarting(true)
    void (async () => {
      await flush?.()
      if (!account || !seedKey || !active()) return
      const value =
        shouldCopy && currentValue !== undefined
          ? typeof currentValue === 'string'
            ? currentValue
            : copyEntryMedia(
                fields,
                currentValue,
                coordinates.path,
                destination.path,
                media,
              )
          : undefined
      stageTranslation(client, seedKey, value)
      await navigate(destination)
      setStartOpen(false)
    })()
      .catch((error) => {
        if (seedKey) client.removeQueries({ queryKey: seedKey, exact: true })
        notifyError(
          error,
          _t({ message: 'Could not start this translation.' }),
          {
            account,
          },
        )
      })
      .finally(() => setStarting(false))
  }

  function chooseMissing(item: Translation) {
    if (!allowCreate || !draftReady || starting || !preferences.ready) return
    setOpen(false)
    const preference = preferences.editing.newTranslations
    if (preference === 'ask') {
      setTarget(item)
      setStartOpen(true)
    } else startTranslation(item, preference === 'copy')
  }

  function language(item: Translation) {
    const contents = (
      <>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.code === locale ? (
          <HugeiconsIcon icon={Check} className="ml-auto" aria-hidden="true" />
        ) : !item.exists ? (
          <HugeiconsIcon
            icon={Plus}
            className="ml-auto text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </>
    )
    return (
      <DropdownMenuItem
        key={item.code}
        disabled={
          item.code === locale ||
          (!item.exists &&
            (!allowCreate || !draftReady || starting || !preferences.ready))
        }
        asChild
      >
        {schemaType === 'file' ? (
          <Link
            to="/github/$owner/$repo/$branch/file/$name"
            params={coordinates}
            search={{ locale: item.code }}
            onClick={(event) => {
              if (
                !item.exists &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault()
                chooseMissing(item)
              }
            }}
            aria-current={item.code === locale ? 'true' : undefined}
          >
            {contents}
          </Link>
        ) : (
          <Link
            to="/github/$owner/$repo/$branch/collection/$name/entry/$"
            params={{ ...coordinates, _splat: item.path }}
            search={{ locale: item.code }}
            onClick={(event) => {
              if (
                !item.exists &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault()
                chooseMissing(item)
              }
            }}
            aria-current={item.code === locale ? 'true' : undefined}
          >
            {contents}
          </Link>
        )}
      </DropdownMenuItem>
    )
  }
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <LocaleMenuTrigger label={label} />
        <DropdownMenuContent align="end" className={localeMenuClassName}>
          {translations.data ? (
            <>
              {available.length ? (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <UiTrans>Existing translations</UiTrans>
                  </DropdownMenuLabel>
                  {available.map(language)}
                </DropdownMenuGroup>
              ) : null}
              {missing.length ? (
                <>
                  {available.length ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      <UiTrans>Missing translations</UiTrans>
                    </DropdownMenuLabel>
                    {missing.map(language)}
                  </DropdownMenuGroup>
                </>
              ) : null}
            </>
          ) : (
            <>
              {config.locales.map((item) => (
                <DropdownMenuItem key={item.code} disabled>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.code === locale ? (
                    <HugeiconsIcon
                      icon={Check}
                      className="ml-auto"
                      aria-hidden="true"
                    />
                  ) : null}
                </DropdownMenuItem>
              ))}
              {translations.isPending ? (
                <DropdownMenuItem disabled>
                  <UiTrans>Checking translations…</UiTrans>
                  <Spinner aria-hidden="true" />
                </DropdownMenuItem>
              ) : null}
            </>
          )}
          {translations.isError ? (
            <>
              <div
                role="alert"
                className="whitespace-normal px-2 py-1.5 text-sm text-destructive"
              >
                <span>
                  {translations.data
                    ? _t({
                        message:
                          'Could not refresh translations. The displayed results may be out of date.',
                      })
                    : _t({
                        message: 'Could not check translations.',
                      })}
                </span>
              </div>
              <DropdownMenuItem
                asChild
                disabled={translations.isFetching}
                onSelect={(event) => {
                  event.preventDefault()
                  void translations.refetch()
                }}
              >
                <Button
                  size="xs"
                  variant="outline"
                  aria-busy={translations.isFetching}
                  disabled={translations.isFetching}
                >
                  <UiTrans>Try again</UiTrans>
                  {translations.isFetching ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : null}
                </Button>
              </DropdownMenuItem>
            </>
          ) : null}
          {onCopy && sources.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={!draftReady}>
                  <UiTrans>Copy from…</UiTrans>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={localeMenuClassName}>
                  {sources.map((item) => (
                    <DropdownMenuItem
                      key={item.code}
                      onSelect={() => {
                        setCopy({ path: item.path, label: item.label })
                        setCopyOpen(true)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <StartTranslationDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        language={target?.label}
        source={label}
        account={auth.data?.user?.id}
        canCopy={draftReady && currentValue !== undefined}
        busy={starting}
        onStart={(shouldCopy) => {
          if (target) startTranslation(target, shouldCopy)
        }}
      />
      <Dialog
        open={copyOpen}
        onOpenChange={(next) => {
          if (!copying) setCopyOpen(next)
        }}
      >
        <DialogContent
          showCloseButton={!copying}
          onEscapeKeyDown={(event) => {
            if (copying) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (copying) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Copy from {copy?.label}?</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Copy saved content from {copy?.label} to {label}. This replaces
                the current language’s draft, including unsaved changes. The
                source language stays unchanged. Save when you are ready.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={copying}
              onClick={() => setCopyOpen(false)}
            >
              <UiTrans>Cancel</UiTrans>
            </Button>
            <Button
              aria-busy={copying}
              disabled={copying}
              onClick={() => {
                if (!copy) return
                const account = auth.data?.user?.id
                const active = accountIsActive(client, account)
                setCopying(true)
                void readEntry({ ...coordinates, path: copy.path })
                  .then((entry) => {
                    if (!active()) return
                    if (!entry.sha)
                      throw new Error(
                        'The source translation no longer exists. Refresh the language list and try again.',
                      )
                    onCopy?.(
                      entry.mode === 'raw'
                        ? entry.source
                        : copyEntryMedia(
                            Array.isArray(entry.fields) ? entry.fields : [],
                            entry.content,
                            entry.path,
                            coordinates.path,
                            entry.media,
                          ),
                    )
                    setCopyOpen(false)
                  })
                  .catch((error) =>
                    notifyError(
                      error,
                      _t({ message: 'Could not copy this language.' }),
                      {
                        account,
                      },
                    ),
                  )
                  .finally(() => setCopying(false))
              }}
            >
              <UiTrans>Copy content</UiTrans>
              {copying ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
