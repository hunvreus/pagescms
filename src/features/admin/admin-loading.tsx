import { msg } from '@lingui/core/macro'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { SettingsLayout } from '#/components/settings-layout'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import { HugeiconsIcon } from '@hugeicons/react'
import PlusIcon from '@hugeicons/core-free-icons/Add01Icon'
import ArrowDownIcon from '@hugeicons/core-free-icons/ArrowDown01Icon'
import { SearchInput } from '#/components/search-input'
import { adminNavigation } from '#/features/settings/settings-navigation'
import { AllowlistTable } from './allowlist-table'

export const adminColumns = {
  users: [
    msg({ message: 'Name' }),
    msg({ message: 'Email' }),
    msg({ message: 'GitHub' }),
    msg({ message: 'Joined' }),
    '',
  ],
  repositories: [
    msg({ message: 'Repository' }),
    msg({ message: 'Collaborators' }),
    msg({ message: 'Last opened' }),
    '',
  ],
}
export function AdminSkeleton() {
  const { t: _t, i18n: columnsI18n } = useUiMessages()

  return (
    <SettingsLayout area="Admin" items={adminNavigation}>
      <section id="allowlist" className="scroll-mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">
            <UiTrans>Sign-in access</UiTrans>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              groupClassName="w-48"
              aria-label={_t({ message: 'Search rules' })}
              placeholder={_t({ message: 'Search rules…' })}
              disabled
            />
            <ButtonGroup>
              <Button variant="outline" disabled>
                <HugeiconsIcon
                  icon={PlusIcon}
                  aria-hidden="true"
                  data-icon="inline-start"
                />
                <UiTrans>Add rule</UiTrans>
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label={_t({ message: 'More sign-in access actions' })}
              >
                <HugeiconsIcon icon={ArrowDownIcon} aria-hidden="true" />
              </Button>
            </ButtonGroup>
          </div>
        </div>
        <AllowlistTable loading />
      </section>
      {(['users', 'repositories'] as const).map((id) => (
        <section key={id} id={id} className="scroll-mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">
              {id === 'users'
                ? _t({ message: 'Users' })
                : _t({ message: 'Repositories' })}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                groupClassName="w-48"
                aria-label={_t({ message: `Search ${id}` })}
                placeholder={_t({ message: `Search ${id}` })}
                disabled
              />
              {id === 'users' ? (
                <Button variant="destructive" disabled>
                  <UiTrans>Revoke all sessions</UiTrans>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="scrollbar overflow-x-auto rounded-xl border bg-card">
            <table
              className="w-full text-left text-sm"
              aria-label={_t({ message: `Loading ${id}` })}
              aria-busy="true"
            >
              <thead className="border-b text-muted-foreground">
                <tr>
                  {adminColumns[id].map((label) => (
                    <th
                      key={typeof label === 'string' ? label : label.id}
                      className="px-4 py-3 font-medium"
                    >
                      {typeof label === 'string' ? label : columnsI18n._(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {[0, 1, 2].map((row) => (
                  <tr key={row} aria-hidden="true">
                    {adminColumns[id].map((label) => (
                      <td
                        key={typeof label === 'string' ? label : label.id}
                        className="px-4 py-3"
                      >
                        <Skeleton className="h-5 w-24 max-w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <section id="cache" className="scroll-mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">
            <UiTrans>Cache</UiTrans>
          </h2>
          <Button disabled variant="destructive">
            <UiTrans>Clear all</UiTrans>
          </Button>
        </div>
        <div
          role="status"
          aria-label={_t({ message: 'Loading cache counts' })}
          className="divide-y rounded-xl border bg-card px-4"
        >
          {[msg({ message: 'Content' }), msg({ message: 'Configuration' })].map(
            (label) => (
              <div
                key={typeof label === 'string' ? label : label.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">
                    {typeof label === 'string' ? label : columnsI18n._(label)}
                  </h3>
                  <Skeleton className="h-5 w-48 max-w-full" />
                </div>
                <Button disabled variant="destructive">
                  <UiTrans>Clear</UiTrans>
                </Button>
              </div>
            ),
          )}
        </div>
      </section>
    </SettingsLayout>
  )
}
