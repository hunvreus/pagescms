import { describe, expect, it } from 'vitest'

import { decryptSecret, encryptSecret } from './secret-crypto.server'

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(19)))

describe('secret encryption', () => {
  it('round-trips a secret with a unique authenticated nonce', async () => {
    const first = await encryptSecret('installation-token', key)
    const second = await encryptSecret('installation-token', key)

    expect(first).not.toEqual(second)
    await expect(decryptSecret(first.ciphertext, first.iv, key)).resolves.toBe(
      'installation-token',
    )
  })

  it('rejects tampered ciphertext and invalid keys', async () => {
    const encrypted = await encryptSecret('installation-token', key)
    const bytes = Uint8Array.from(atob(encrypted.ciphertext), (character) =>
      character.charCodeAt(0),
    )
    bytes[0] ^= 1
    const tampered = btoa(String.fromCharCode(...bytes))

    await expect(decryptSecret(tampered, encrypted.iv, key)).rejects.toThrow()
    await expect(encryptSecret('value', btoa('short'))).rejects.toThrow(
      'exactly 32 bytes',
    )
  })
})
