import { OperationAcknowledgementError } from '#/lib/operation-error'

type Profile = { name: string; image: string | null }
type Update = {
  accountId: string
  name: string
  image?: string | null
}

export type ProfileNotice =
  | { type: 'success'; field: 'name' | 'image' }
  | {
      type: 'error'
      field: 'name' | 'image'
      error: unknown
      retry?: () => void
    }

export interface ProfileEditorState extends Profile {
  confirmedImage: string | null
  namePending: boolean
  imagePending: boolean
  savingName: boolean
  saving: boolean
  savingImage: boolean
  processing: boolean
  nameChanged: boolean
  nameError?: string
  imageError?: string
  nameSaveError: unknown
  imageSaveError: unknown
}

export function createProfileEditor({
  accountId,
  profile,
  active,
  save,
  notify = () => {},
}: {
  accountId: string
  profile: Profile
  active: () => boolean
  save: (update: Update) => Promise<Profile>
  notify?: (notice: ProfileNotice) => void
}) {
  let baseline = profile
  let state: ProfileEditorState = {
    ...profile,
    confirmedImage: profile.image,
    namePending: false,
    imagePending: false,
    savingName: false,
    saving: false,
    savingImage: false,
    processing: false,
    nameChanged: false,
    nameSaveError: null,
    imageSaveError: null,
  }
  let queuedName: string | undefined
  let imageDue = false
  let uncertainName = false
  let uncertainImage = false
  const listeners = new Set<() => void>()

  function update(patch: Partial<ProfileEditorState>) {
    state = { ...state, ...patch }
    state.nameChanged = state.name.trim() !== baseline.name || uncertainName
    state.confirmedImage = baseline.image
    state.namePending = state.savingName || queuedName !== undefined
    state.imagePending = state.savingImage || imageDue
    for (const listener of listeners) listener()
  }

  function hasQueuedChange() {
    return queuedName !== undefined || imageDue
  }

  function abandon() {
    queuedName = undefined
    imageDue = false
    uncertainName = uncertainImage = false
    baseline = { name: '', image: null }
    update({
      ...baseline,
      nameSaveError: null,
      imageSaveError: null,
      nameError: undefined,
      imageError: undefined,
      processing: false,
      saving: false,
      savingName: false,
      savingImage: false,
    })
  }

  async function persist() {
    if (!active()) {
      abandon()
      return
    }
    if (state.saving) return
    const requestedName = queuedName
    queuedName = undefined
    const name = requestedName?.trim() ?? baseline.name
    const validName = name.length > 0 && name.length <= 120
    const saveName =
      requestedName !== undefined &&
      validName &&
      (name !== baseline.name || uncertainName)
    if (requestedName !== undefined) {
      const error = !validName
        ? name
          ? 'Use 120 characters or fewer.'
          : 'Name cannot be empty.'
        : undefined
      update(
        state.name === requestedName
          ? {
              nameError: error,
              ...(validName && !saveName ? { name: baseline.name } : {}),
            }
          : {},
      )
      if (error && state.name === requestedName)
        notify({ type: 'error', field: 'name', error: new Error(error) })
    }
    const saveImage =
      imageDue && (state.image !== baseline.image || uncertainImage)
    imageDue = false
    if (!saveName && !saveImage) {
      update({})
      return
    }
    const submitted = { name: requestedName, image: state.image }
    update({
      saving: true,
      savingName: saveName,
      savingImage: saveImage,
      ...(saveName ? { nameSaveError: null } : {}),
      ...(saveImage ? { imageSaveError: null } : {}),
    })
    try {
      const confirmed = await save({
        accountId,
        name: saveName ? name : baseline.name,
        ...(saveImage ? { image: submitted.image } : {}),
      })
      if (!active()) {
        abandon()
        update({ saving: false, savingName: false, savingImage: false })
        return
      }
      baseline = { name: confirmed.name, image: confirmed.image }
      if (saveName) uncertainName = false
      if (saveImage) uncertainImage = false
      const currentName = saveName && state.name === submitted.name
      const currentImage = saveImage && state.image === submitted.image
      update({
        ...(saveName && state.name === submitted.name
          ? { name: confirmed.name }
          : {}),
        ...(saveImage && state.image === submitted.image
          ? { image: confirmed.image }
          : {}),
        saving: false,
        savingName: false,
        savingImage: false,
      })
      if (currentName || currentImage)
        notify({ type: 'success', field: currentName ? 'name' : 'image' })
      if (hasQueuedChange()) void persist()
    } catch (error) {
      if (!active()) {
        abandon()
        return
      }
      if (error instanceof OperationAcknowledgementError) {
        baseline = {
          name: saveName ? name : baseline.name,
          image: saveImage ? submitted.image : baseline.image,
        }
        if (saveName) uncertainName = false
        if (saveImage) uncertainImage = false
        update({
          ...(saveName && state.name === submitted.name ? { name } : {}),
          saving: false,
          savingName: false,
          savingImage: false,
          ...(saveName ? { nameSaveError: null } : {}),
          ...(saveImage ? { imageSaveError: null } : {}),
        })
        notify({ type: 'error', field: saveName ? 'name' : 'image', error })
        if (hasQueuedChange()) void persist()
        return
      }
      // Keep the editable values for an explicit retry; never loop on failure.
      uncertainName ||= saveName
      uncertainImage ||= saveImage
      if (saveName && queuedName === submitted.name) queuedName = undefined
      if (saveImage && state.image === submitted.image) imageDue = false
      update({
        saving: false,
        savingName: false,
        savingImage: false,
        ...(saveName ? { nameSaveError: error } : {}),
        ...(saveImage ? { imageSaveError: error } : {}),
      })
      notify({
        type: 'error',
        field: saveName ? 'name' : 'image',
        error,
        retry: () => void retryFailed(),
      })
      // A different edit queued during this request still gets its own attempt.
      if (hasQueuedChange()) void persist()
    }
  }

  function submitName() {
    queuedName = state.name
    update({ nameSaveError: null })
    return persist()
  }

  function retryFailed() {
    if (state.nameSaveError) queuedName = state.name
    if (state.imageSaveError) imageDue = true
    return persist()
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => state,
    setSave(next: typeof save) {
      save = next
    },
    sync(next: Profile) {
      if (!active()) return
      if (state.saving) return
      const name = state.name === baseline.name ? next.name : state.name
      const image = state.image === baseline.image ? next.image : state.image
      baseline = { name: next.name, image: next.image }
      update({ name, image })
    },
    setName(name: string) {
      update({ name, nameError: undefined, nameSaveError: null })
    },
    setImage(image: string | null) {
      imageDue = true
      update({ image, imageError: undefined, imageSaveError: null })
      void persist()
    },
    setProcessing(processing: boolean) {
      update({ processing })
    },
    setImageError(imageError?: string) {
      update({ imageError })
      if (imageError && active())
        notify({ type: 'error', field: 'image', error: new Error(imageError) })
    },
    saveName: submitName,
    abandon,
  }
}
