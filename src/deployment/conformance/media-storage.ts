import type {
  MediaDirectUploadPlan,
  MediaStorage,
} from '#/server/media-provider.server'

export interface MediaStorageConformanceOptions {
  root: string
  storage: MediaStorage
}

function join(root: string, name: string) {
  return root ? `${root.replace(/\/$/, '')}/${name}` : name
}

function requireCapability(
  storage: MediaStorage,
  capability: keyof MediaStorage['capabilities'],
) {
  if (!storage.capabilities[capability]) {
    throw new Error(
      `Media storage ${storage.id} does not support required ${capability} capability`,
    )
  }
}

export async function verifyMediaStorageConformance({
  root,
  storage,
}: MediaStorageConformanceOptions) {
  for (const capability of [
    'createDirectory',
    'upload',
    'move',
    'rename',
    'remove',
  ] as const) {
    requireCapability(storage, capability)
  }

  const metadata = { message: 'Pages CMS media conformance fixture' }
  const directory = join(root, 'nested')
  const original = join(root, 'fixture.txt')
  const moved = join(directory, 'fixture-renamed.txt')

  await storage.createDirectory({ path: directory, metadata })
  const written = await storage.write({
    path: original,
    content: 'cGFnZXNjbXM=',
    metadata,
  })
  if (!written.version) {
    throw new Error('Media storage writes must return a version')
  }

  const rootManifest = await storage.list(root)
  if (
    !rootManifest.assets.some(
      (asset) => asset.kind === 'directory' && asset.path === directory,
    ) ||
    !rootManifest.assets.some(
      (asset) => asset.kind === 'file' && asset.path === original,
    )
  ) {
    throw new Error('Media storage listing omitted written assets')
  }

  const stored = await storage.read(original)
  if (new TextDecoder().decode(stored.bytes) !== 'pagescms') {
    throw new Error('Media storage did not preserve file bytes')
  }

  const origins = await storage.resolveOrigins([original])
  if (
    origins.length !== 1 ||
    origins[0].path !== original ||
    !/^https?:/.test(origins[0].url)
  ) {
    throw new Error('Media storage did not resolve a browser-safe origin')
  }

  const movedResult = await storage.move({
    path: original,
    destination: moved,
    version: written.version,
    metadata,
  })
  if (!movedResult.version || movedResult.path !== moved) {
    throw new Error('Media storage move returned an invalid result')
  }

  const nestedManifest = await storage.list(directory)
  if (!nestedManifest.assets.some((asset) => asset.path === moved)) {
    throw new Error('Media storage move did not create the destination')
  }

  await storage.remove({
    path: moved,
    version: movedResult.version,
    metadata,
  })
  const finalManifest = await storage.list(directory)
  if (finalManifest.assets.some((asset) => asset.path === moved)) {
    throw new Error('Media storage remove left the file in its directory')
  }
}

export interface MediaDirectUploadConformanceOptions {
  root: string
  storage: MediaStorage
  upload: (
    plan: MediaDirectUploadPlan,
    bytes: Uint8Array,
  ) => Promise<readonly { number: number; etag: string }[] | undefined>
}

export async function verifyMediaDirectUploadConformance({
  root,
  storage,
  upload,
}: MediaDirectUploadConformanceOptions) {
  if (!storage.capabilities.directUpload || !storage.directUpload) {
    throw new Error(
      `Media storage ${storage.id} does not support direct upload`,
    )
  }

  const bytes = new TextEncoder().encode('pagescms-direct-upload')
  const path = join(root, 'direct-upload-fixture.txt')
  const plan = await storage.directUpload.initiate({
    path,
    size: bytes.length,
    contentType: 'text/plain',
    metadata: { message: 'Pages CMS direct upload conformance fixture' },
    reservationId: 'media-conformance-reservation',
  })
  const parts = await upload(plan, bytes)
  const completed = await storage.directUpload.complete({
    ticket: plan.ticket,
    parts,
  })
  if (
    completed.result.path !== path ||
    !completed.result.version ||
    completed.reservationId !== 'media-conformance-reservation'
  ) {
    throw new Error('Direct upload completion returned invalid metadata')
  }
  const stored = await storage.read(path)
  if (new TextDecoder().decode(stored.bytes) !== 'pagescms-direct-upload') {
    throw new Error('Direct upload did not preserve file bytes')
  }
  await storage.remove({
    path,
    version: completed.result.version,
    metadata: { message: 'Remove direct upload conformance fixture' },
  })

  const abortedPath = join(root, 'direct-upload-abort.txt')
  const abortedPlan = await storage.directUpload.initiate({
    path: abortedPath,
    size: bytes.length,
    contentType: 'text/plain',
    metadata: { message: 'Pages CMS direct upload abort fixture' },
    reservationId: 'media-conformance-abort',
  })
  const aborted = await storage.directUpload.abort({
    ticket: abortedPlan.ticket,
  })
  if (
    aborted.path !== abortedPath ||
    aborted.reservationId !== 'media-conformance-abort'
  ) {
    throw new Error('Direct upload abort returned invalid metadata')
  }
}
