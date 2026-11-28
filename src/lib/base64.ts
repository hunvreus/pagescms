export function base64ByteLength(value: string) {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new Error('Invalid base64 content')
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

export function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes =
    typeof Buffer === 'undefined'
      ? Uint8Array.from(binary, (item) => item.charCodeAt(0))
      : Buffer.from(binary, 'latin1')
  return new TextDecoder().decode(bytes)
}

export function encodeBase64Utf8(value: string) {
  if (typeof Buffer !== 'undefined')
    return Buffer.from(value, 'utf8').toString('base64')
  let binary = ''
  for (const byte of new TextEncoder().encode(value))
    binary += String.fromCharCode(byte)
  return btoa(binary)
}
