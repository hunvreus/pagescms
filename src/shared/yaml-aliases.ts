export function limitAliasExpansion(value: unknown) {
  const seen = new Map<object, { count: number; weight: number }>()
  const active = new Set<object>()
  function visit(node: unknown): number {
    if (!node || typeof node !== 'object') return 1
    if (active.has(node)) throw new Error('Cyclic alias')
    const existing = seen.get(node)
    if (existing) {
      const weight = ++existing.count * existing.weight
      if (weight > 100)
        throw new Error(
          'Excessive alias count indicates a resource exhaustion attack',
        )
      return weight
    }
    const entry = { count: 1, weight: 1 }
    seen.set(node, entry)
    active.add(node)
    for (const child of Object.values(node))
      entry.weight = Math.max(entry.weight, visit(child))
    active.delete(node)
    return entry.weight
  }
  visit(value)
}
