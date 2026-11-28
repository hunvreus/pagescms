import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { Card, CardContent, CardFooter } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { ProfileSetupHeading } from './profile-setup-heading'

export function ProfileSetupLoading() {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-sm">
        <Card>
          <ProfileSetupHeading />
          <CardContent
            className="space-y-5"
            role="status"
            aria-label={_t({ message: 'Loading profile' })}
          >
            {[
              remainingT({ message: 'Picture' }),
              remainingT({ message: 'Display name' }),
              remainingT({ message: 'Email' }),
            ].map((label, index) => (
              <div
                className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3"
                key={label}
              >
                <p className="text-sm font-medium">{label}</p>
                <Skeleton
                  className={index === 0 ? 'size-9 rounded-full' : 'h-8 w-full'}
                />
              </div>
            ))}
          </CardContent>
          <CardFooter className="justify-end">
            <Button disabled>
              <UiTrans>Continue</UiTrans>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
