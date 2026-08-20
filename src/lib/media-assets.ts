const contentTypes: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

function encodePath(value: string) {
  return value.split('/').map(encodeURIComponent).join('/')
}

export function mediaAssetUrl({
  owner,
  repo,
  branch,
  name,
  path,
}: {
  owner: string
  repo: string
  branch: string
  name: string
  path: string
}) {
  return `/api/media-preview/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodeURIComponent(name)}/${encodePath(path)}`
}

export function mediaContentType(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
  return contentTypes[extension] ?? 'application/octet-stream'
}

export function decodeBase64Bytes(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
