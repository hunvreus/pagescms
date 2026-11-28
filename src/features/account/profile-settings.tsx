import { Trans as UiTrans } from '@lingui/react/macro'
import { ProfileFields } from './profile-fields'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { useProfileEditor } from './use-profile-editor'

export function ProfileSettings({
  user,
}: {
  user: { id: string; email: string; name: string; image: string | null }
}) {
  const profile = useProfileEditor(user)
  useUnsavedWarning(profile.nameChanged || profile.saving || profile.processing)
  return (
    <section className="space-y-3" aria-labelledby="profile-title">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2 id="profile-title" className="text-base font-medium">
          <UiTrans>Profile</UiTrans>
        </h2>
      </div>
      <form
        id="profile-form"
        noValidate
        className="divide-y overflow-hidden rounded-xl border bg-card px-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (profile.ready && !profile.namePending && profile.nameChanged)
            void profile.saveName()
        }}
      >
        <ProfileFields
          email={user.email}
          name={profile.name}
          image={profile.confirmedImage}
          disabled={!profile.ready}
          processing={profile.processing || profile.imagePending}
          savingName={profile.namePending}
          nameChanged={profile.nameChanged}
          nameError={profile.nameError}
          imageError={profile.imageError}
          nameSaveError={profile.nameSaveError}
          imageSaveError={profile.imageSaveError}
          onNameChange={profile.setName}
          onImageChange={profile.setImage}
          onProcessingChange={profile.setProcessing}
          onImageError={profile.setImageError}
        />
      </form>
    </section>
  )
}
