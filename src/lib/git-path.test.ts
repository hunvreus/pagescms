import { describe, expect, it } from 'vitest'

import {
  getGitFileName,
  getGitParentPath,
  getGitRelativePath,
  isGitPathWithin,
  joinGitPath,
  normalizeGitPath,
} from './git-path'

describe('normalizeGitPath', () => {
  it.each([
    ['', ''],
    ['/', ''],
    ['/content//posts/./hello.md/', 'content/posts/hello.md'],
    ['content/drafts/../posts/hello.md', 'content/posts/hello.md'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeGitPath(input)).toBe(expected)
  })

  it.each(['../secret.md', 'content/../../secret.md', 'content/\0secret.md'])(
    'rejects unsafe path %j',
    (path) => {
      expect(() => normalizeGitPath(path)).toThrow('Git path')
    },
  )
})

describe('Git path relationships', () => {
  it('checks containment on segment boundaries', () => {
    expect(isGitPathWithin('content/posts', 'content/posts/hello.md')).toBe(
      true,
    )
    expect(isGitPathWithin('content/posts', 'content/posts')).toBe(true)
    expect(isGitPathWithin('content/posts', 'content/posts-old/hello.md')).toBe(
      false,
    )
  })

  it('treats the repository root as containing every valid path', () => {
    expect(isGitPathWithin('', 'content/posts/hello.md')).toBe(true)
  })

  it('returns a relative path only for descendants of the root', () => {
    expect(getGitRelativePath('content/posts/hello.md', 'content')).toBe(
      'posts/hello.md',
    )
    expect(() =>
      getGitRelativePath('content-pages/hello.md', 'content'),
    ).toThrow('outside')
  })

  it('joins, names, and finds parents through canonical paths', () => {
    const path = joinGitPath('content/', '/posts', './hello.md')

    expect(path).toBe('content/posts/hello.md')
    expect(getGitFileName(path)).toBe('hello.md')
    expect(getGitParentPath(path)).toBe('content/posts')
    expect(getGitParentPath('hello.md')).toBe('')
  })
})
