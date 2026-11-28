export function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertPluginIds(plugins: readonly { id: string }[]) {
  const ids = new Set<string>()
  for (const plugin of plugins) {
    if (
      !isRecord(plugin) ||
      typeof plugin.id !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(plugin.id)
    )
      throw new Error('Invalid plugin ID')
    if (ids.has(plugin.id)) throw new Error(`Duplicate plugin: ${plugin.id}`)
    ids.add(plugin.id)
  }
}
