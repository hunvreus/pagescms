import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { ProfileSetupHeading } from './profile-setup-heading'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import ArrowRight from '@hugeicons/core-free-icons/ArrowRight02Icon'
import { notifyError } from '#/lib/notifications'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardFooter } from '#/components/ui/card'
import { Field, FieldLabel, FieldError } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { ProfilePicture } from './profile-picture'
import { useProfileUpdate } from './use-profile-update'
import type { CurrentUser } from '#/lib/authentication'

export function ProfileSetup({
  user,
  destination,
}: {
  user: CurrentUser
  destination: string
}) {
  const { t: _t } = useUiMessages()

  const [name, setName] = useState(user.name === user.email ? '' : user.name)
  const [image, setImage] = useState(user.image)
  const [processing, setProcessing] = useState(false)
  const [ready, setReady] = useState(false)
  const { mutateAsync: updateProfile, isPending: saving } = useProfileUpdate()
  const [pictureError, setPictureError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const router = useRouter()
  useEffect(() => setReady(true), [])
  async function save() {
    if (!ready || saving || processing) return
    if (!name.trim() || name.trim().length > 120) {
      setNameError(
        !name.trim() ? 'Name cannot be empty.' : 'Use 120 characters or fewer.',
      )
      return
    }
    const origin = router.state.location.href
    try {
      await updateProfile({
        accountId: user.id,
        name,
        ...(image !== user.image ? { image } : {}),
      })
      if (router.state.location.href === origin)
        await router.navigate({ href: destination, replace: true })
    } catch (cause) {
      notifyError(
        cause,
        _t({ message: 'Could not save your profile. Try again.' }),
        {
          account: user.id,
        },
      )
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <form
        className="w-full max-w-sm"
        aria-label={_t({ message: 'Confirm your details' })}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Card>
          <ProfileSetupHeading />
          <CardContent className="space-y-5">
            <Field
              orientation="horizontal"
              className={fieldClassName}
              data-invalid={Boolean(pictureError)}
            >
              <FieldLabel htmlFor="profile-picture">
                <UiTrans>Picture</UiTrans>
              </FieldLabel>
              <div className="min-w-0 space-y-2">
                <ProfilePicture
                  email={user.email}
                  name={name}
                  image={image}
                  disabled={saving || !ready}
                  processing={processing}
                  onChange={setImage}
                  onProcessingChange={setProcessing}
                  onError={setPictureError}
                  invalid={Boolean(pictureError)}
                  errorDescription={
                    pictureError ? 'profile-picture-error' : undefined
                  }
                />
                <FieldError id="profile-picture-error">
                  {pictureError}
                </FieldError>
              </div>
            </Field>
            <Field
              orientation="horizontal"
              className={fieldClassName}
              data-invalid={Boolean(nameError)}
            >
              <FieldLabel htmlFor="profile-name">
                <UiTrans>Display name</UiTrans>
              </FieldLabel>
              <div className="min-w-0 space-y-2">
                <Input
                  id="profile-name"
                  autoComplete="name"
                  required
                  maxLength={120}
                  disabled={saving || !ready}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={
                    nameError ? 'profile-name-error' : undefined
                  }
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setNameError(undefined)
                  }}
                />
                <FieldError id="profile-name-error">{nameError}</FieldError>
              </div>
            </Field>
            <Field orientation="horizontal" className={fieldClassName}>
              <FieldLabel htmlFor="profile-email">
                <UiTrans>Email</UiTrans>
              </FieldLabel>
              <Input
                id="profile-email"
                type="email"
                className="text-muted-foreground"
                readOnly
                value={user.email}
              />
            </Field>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              aria-busy={saving}
              type="submit"
              disabled={saving || processing || !ready}
            >
              <UiTrans>Continue</UiTrans>
              {saving ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : (
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowRight}
                  data-icon="inline-end"
                />
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  )
}

const fieldClassName = 'grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3'
