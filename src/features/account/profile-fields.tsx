import { localizeErrorMessage } from '#/i18n/errors'
import { Trans, useLingui as useUiMessages } from '@lingui/react/macro'
import { profileFieldCopy } from './account-copy'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Spinner } from '#/components/ui/spinner'
import { userFacingError } from '#/lib/access-denial'
import { cn } from 'cn'
import { ProfilePicture } from './profile-picture'
import { settingsRowClassName } from '#/components/settings-row'

const profileRowClassName = cn(settingsRowClassName, 'grid-cols-1 py-4')

export function ProfileFields({
  email,
  name,
  image,
  disabled,
  processing,
  savingName,
  nameChanged,
  nameError,
  imageError,
  nameSaveError,
  imageSaveError,
  onNameChange,
  onImageChange,
  onProcessingChange,
  onImageError,
}: {
  email: string
  name: string
  image: string | null
  disabled: boolean
  processing: boolean
  savingName: boolean
  nameChanged: boolean
  nameError?: string
  imageError?: string
  nameSaveError: unknown
  imageSaveError: unknown
  onNameChange: (name: string) => void
  onImageChange: (image: string | null) => void
  onProcessingChange: (processing: boolean) => void
  onImageError: (error?: string) => void
}) {
  const { t: _t, i18n: _i18n } = useUiMessages()

  const nameMessage =
    (nameError && localizeErrorMessage(_i18n, nameError)) ||
    (nameSaveError
      ? userFacingError(
          nameSaveError,
          _t({ message: 'Could not save your name. Try again.' }),
          _i18n,
        )
      : undefined)
  const imageMessage =
    (imageError && localizeErrorMessage(_i18n, imageError)) ||
    (imageSaveError
      ? userFacingError(
          imageSaveError,
          _t({ message: 'Could not save your picture. Try again.' }),
          _i18n,
        )
      : undefined)
  return (
    <>
      <div className={profileRowClassName}>
        <div>
          <p className="text-sm font-medium">
            {_i18n._(profileFieldCopy.picture.label)}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {_i18n._(profileFieldCopy.picture.description)}
          </p>
        </div>
        <div className="min-w-0">
          <ProfilePicture
            email={email}
            name={name}
            image={image}
            disabled={disabled}
            processing={processing}
            invalid={Boolean(imageMessage)}
            errorDescription={
              imageMessage ? 'profile-picture-error' : undefined
            }
            confirmRemoval
            onChange={onImageChange}
            onProcessingChange={onProcessingChange}
            onError={onImageError}
          />
          {imageMessage ? (
            <span id="profile-picture-error" className="sr-only">
              {imageMessage}
            </span>
          ) : null}
        </div>
      </div>
      <div className={profileRowClassName}>
        <div>
          <label
            className="block text-sm font-medium leading-5"
            htmlFor="profile-name"
          >
            {_i18n._(profileFieldCopy.name.label)}
          </label>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {_i18n._(profileFieldCopy.name.description)}
          </p>
        </div>
        <div className="min-w-0">
          <InputGroup>
            <InputGroupInput
              id="profile-name"
              autoComplete="name"
              maxLength={120}
              required
              disabled={disabled}
              aria-invalid={Boolean(nameMessage)}
              aria-errormessage={nameMessage ? 'profile-name-error' : undefined}
              aria-busy={savingName}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                aria-disabled={disabled || savingName || !nameChanged}
                aria-busy={savingName}
                className="aria-disabled:opacity-50"
                onClick={(event) => {
                  if (disabled || savingName || !nameChanged)
                    event.preventDefault()
                }}
              >
                <Trans>Save</Trans>
                {savingName ? <Spinner data-icon="inline-end" /> : null}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {nameMessage ? (
            <span id="profile-name-error" className="sr-only">
              {nameMessage}
            </span>
          ) : null}
        </div>
      </div>
    </>
  )
}
