import { expect, it } from 'vitest'
import { getFileExtension } from './file-types'

it('normalizes uppercase media extensions without treating dotfiles as extensions', () => {
  expect(getFileExtension('images/Photo.JPG')).toBe('jpg')
  expect(getFileExtension('images/.gitkeep')).toBe('')
})
