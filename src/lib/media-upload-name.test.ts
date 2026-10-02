import { describe, expect, it } from 'vitest'
import { mediaUploadFilename, parseUploadRename } from './media-upload-name'

describe('upload renaming', () => {
  it('preserves original names unless configured, and slugifies safe names', async () => {
    expect(await mediaUploadFilename('Hello World.JPG', false, 'one')).toBe(
      'Hello World.JPG',
    )
    expect(await mediaUploadFilename('Café Photo.JPG', true, 'one')).toBe(
      'cafe-photo.jpg',
    )
    expect(await mediaUploadFilename('Café Photo.JPG', 'safe', 'one')).toBe(
      'cafe-photo.jpg',
    )
  })
  it('generates stable random names for retries and distinct names for different uploads', async () => {
    const name = await mediaUploadFilename('Photo.PNG', 'random', 'one')
    expect(name).toMatch(/^[a-f0-9]{24}\.png$/)
    expect(await mediaUploadFilename('Photo.PNG', 'random', 'one')).toBe(name)
    expect(await mediaUploadFilename('Photo.PNG', 'random', 'two')).not.toBe(
      name,
    )
    expect(() => parseUploadRename('unsafe')).toThrow()
  })
})
