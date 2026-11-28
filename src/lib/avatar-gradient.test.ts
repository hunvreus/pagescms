import { describe, expect, it } from 'vitest'
import { avatarGradient } from './avatar-gradient'

describe('avatar gradients', () => {
  it.each([
    ['rauchg', 126, 246],
    ['alex', 244, 4],
    ['bob', 350, 110],
  ])('matches vercel/avatar colors for %s', async (identity, first, second) => {
    expect(await avatarGradient(identity)).toBe(
      `linear-gradient(135deg, hsl(${first} 95% 50%), hsl(${second} 95% 50%))`,
    )
  })

  it('keeps the same gradient when an email changes case or whitespace', async () => {
    expect(await avatarGradient('  EDITOR@example.com ')).toBe(
      await avatarGradient('editor@example.com'),
    )
  })
})
