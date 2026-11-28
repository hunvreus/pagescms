type NameIssue = { path: (string | number)[]; message: string }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Content identities span groups; media has its own routing namespace. */
export function configurationNameIssues(configuration: unknown): NameIssue[] {
  if (!record(configuration)) return []
  const issues: NameIssue[] = []
  const check = (entries: Map<string, (string | number)[][]>, kind: string) => {
    for (const [name, paths] of entries) {
      if (paths.length < 2) continue
      for (const path of paths) {
        issues.push({
          path,
          message: `Duplicate ${kind} name "${name}". Also defined at ${paths
            .filter((other) => other !== path)
            .map((other) => other.join('.'))
            .join(', ')}.`,
        })
      }
    }
  }
  const content = new Map<string, (string | number)[][]>()
  const visit = (items: unknown, path: (string | number)[]) => {
    if (!Array.isArray(items)) return
    items.forEach((item, index) => {
      if (!record(item)) return
      if (item.type === 'group') {
        visit(item.items, [...path, index, 'items'])
      } else if (typeof item.name === 'string') {
        const paths = content.get(item.name) ?? []
        paths.push([...path, index, 'name'])
        content.set(item.name, paths)
      }
    })
  }
  visit(configuration.content, ['content'])
  check(content, 'content')
  const media = new Map<string, (string | number)[][]>()
  if (Array.isArray(configuration.media)) {
    configuration.media.forEach((item, index) => {
      if (!record(item) || typeof item.name !== 'string') return
      const paths = media.get(item.name) ?? []
      paths.push(['media', index, 'name'])
      media.set(item.name, paths)
    })
  }
  check(media, 'media')
  return issues
}
