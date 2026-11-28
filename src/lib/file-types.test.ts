import { expect, it } from 'vitest'
import { getFileCategory, getFileExtension } from './file-types'

it('normalizes uppercase media extensions without treating dotfiles as extensions', () => {
  expect(getFileExtension('images/Photo.JPG')).toBe('jpg')
  expect(getFileExtension('images/.gitkeep')).toBe('')
})

it.each([
  ['uploads/photo.JPG', 'image'],
  ['uploads/cover.svg', 'image'],
  ['uploads/report.pdf', 'document'],
  ['uploads/clip.mp4', 'video'],
  ['uploads/interview.MP3', 'audio'],
  ['uploads/backup.tar.gz', 'compressed'],
  ['uploads/settings.json', 'code'],
  ['uploads/font.woff2', 'font'],
  ['uploads/export.csv', 'spreadsheet'],
  ['uploads/unknown', undefined],
  ['uploads/.gitkeep', undefined],
] as const)('classifies %s for the shared media icons', (path, expected) => {
  expect(getFileCategory(path)).toBe(expected)
})
