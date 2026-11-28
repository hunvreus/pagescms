import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  createMediaCompletion,
  mediaCompletionAt,
} from './configuration-completion'
import { createMediaConfigurationShape } from '#/shared/configuration-schema'

describe('configuration media property completion', () => {
  it('suggests composed plugin properties and honors removals', () => {
    const shape = createMediaConfigurationShape([
      {
        id: 'plugin',
        configurationSchema: {
          media: {
            storage: {
              action: 'add',
              schema: (z) =>
                z.string().optional().describe('Storage connection'),
            },
            path: { action: 'remove' },
          },
        },
      },
    ])
    const source = 'media:\n  st'
    const result = createMediaCompletion(shape)(
      new CompletionContext(
        EditorState.create({ doc: source }),
        source.length,
        true,
      ),
    )
    expect(result?.options).toContainEqual(
      expect.objectContaining({
        label: 'storage',
        apply: 'storage: ',
        info: 'Storage connection',
      }),
    )
    expect(result?.options.some((option) => option.label === 'path')).toBe(
      false,
    )
  })

  it('limits suggestions to the media object and direct list properties', () => {
    for (const source of [
      'media:\n  in',
      'media:\n  - name: images\n    st',
      'media:\n  - st',
    ]) {
      expect(mediaCompletionAt(source, source.length)).not.toBeNull()
    }
    for (const source of [
      'content:\n  st',
      'media:\n  commit:\n    st',
      'media:\n  input: images\ncontent:\n  st',
      'media:\n  input: im',
    ]) {
      expect(mediaCompletionAt(source, source.length)).toBeNull()
    }
  })
})
