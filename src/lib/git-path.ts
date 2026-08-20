function containsControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
  })
}

/**
 * Converts an absolute-looking or relative repository path into its canonical,
 * repository-relative form. Paths that escape the repository root are rejected.
 */
export function normalizeGitPath(path: string): string {
  if (containsControlCharacter(path)) {
    throw new Error('Git path cannot contain control characters')
  }

  const normalizedSegments: string[] = []

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue

    if (segment === '..') {
      if (normalizedSegments.length === 0) {
        throw new Error('Git path cannot escape the repository root')
      }

      normalizedSegments.pop()
      continue
    }

    normalizedSegments.push(segment)
  }

  return normalizedSegments.join('/')
}

export function joinGitPath(...segments: string[]): string {
  return normalizeGitPath(segments.join('/'))
}

export function getGitFileName(path: string): string {
  return normalizeGitPath(path).split('/').pop() ?? ''
}

export function getGitParentPath(path: string): string {
  const normalizedPath = normalizeGitPath(path)
  return normalizedPath.split('/').slice(0, -1).join('/')
}

export function isGitPathWithin(rootPath: string, candidatePath: string) {
  const root = normalizeGitPath(rootPath)
  const candidate = normalizeGitPath(candidatePath)

  return root === '' || candidate === root || candidate.startsWith(`${root}/`)
}

export function getGitRelativePath(path: string, rootPath: string): string {
  const root = normalizeGitPath(rootPath)
  const candidate = normalizeGitPath(path)

  if (!isGitPathWithin(root, candidate)) {
    throw new Error(`Git path "${candidate}" is outside root "${root}"`)
  }

  if (root === '') return candidate
  if (candidate === root) return ''
  return candidate.slice(root.length + 1)
}
