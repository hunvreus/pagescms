function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function encodeBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function importEncryptionKey(base64Key: string) {
  const bytes = decodeBase64(base64Key)
  if (bytes.byteLength !== 32) {
    throw new Error('Encryption key must contain exactly 32 bytes')
  }
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(value: string, base64Key: string) {
  const key = await importEncryptionKey(base64Key)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  )
  return { ciphertext: encodeBase64(ciphertext), iv: encodeBase64(iv) }
}

export async function decryptSecret(
  ciphertext: string,
  iv: string,
  base64Key: string,
) {
  const key = await importEncryptionKey(base64Key)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(iv) },
    key,
    decodeBase64(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}
